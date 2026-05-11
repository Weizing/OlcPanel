import os
import json
import subprocess
import threading
import time
import psutil
import docker
import jwt
from datetime import datetime, timedelta
from collections import deque
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from functools import wraps

app = Flask(__name__)
CORS(app)

# Fix: Use /app/data instead of /app/src/data
DATA_DIR = '/app/data'
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
CONFIG_FILE = os.path.join(DATA_DIR, 'config.json')

os.makedirs(DATA_DIR, exist_ok=True)

SECRET_KEY = os.environ.get('SECRET_KEY', 'olcpanel-secret-key-change-me')
docker_client = docker.DockerClient(base_url='unix://var/run/docker.sock')

users = {}
containers = {}
logs = {}
traffic_stats = {}
lock = threading.RLock()

CARRIERS = ['wbstream', 'jazz', 'telemost']
TRANSPORTS = ['datachannel', 'vp8channel', 'seichannel', 'videochannel']

TRANSPORT_PARAMS = {
    'datachannel': [],
    'vp8channel': [
        {'name': 'vp8-fps', 'type': 'text', 'default': '25', 'label': 'FPS'},
        {'name': 'vp8-batch', 'type': 'text', 'default': '1', 'label': 'Batch Size'}
    ],
    'seichannel': [
        {'name': 'fps', 'type': 'text', 'default': '25', 'label': 'FPS'},
        {'name': 'batch', 'type': 'text', 'default': '1', 'label': 'Batch Size'},
        {'name': 'frag', 'type': 'text', 'default': '900', 'label': 'Fragment Size (bytes)'},
        {'name': 'ack_timeout', 'type': 'text', 'default': '2000', 'label': 'ACK Timeout (ms)'}
    ],
    'videochannel': [
        {'name': 'codec', 'type': 'select', 'options': ['qrcode', 'tile'], 'default': 'qrcode', 'label': 'Codec'},
        {'name': 'resolution', 'type': 'text', 'default': '640x480', 'label': 'Resolution'},
        {'name': 'bitrate', 'type': 'text', 'default': '500000', 'label': 'Bitrate'},
        {'name': 'hw_accel', 'type': 'checkbox', 'default': False, 'label': 'Hardware Acceleration'}
    ]
}

def load_users():
    global users
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            users = json.load(f)
        # Restore and restart containers
        for uid, user in users.items():
            if user.get('state') == 'running':
                container_exists = False
                if user.get('container_id'):
                    try:
                        container = docker_client.containers.get(user['container_id'])
                        if container.status == 'running':
                            containers[uid] = container.id
                            thread = threading.Thread(target=read_container_logs, args=(uid, container), daemon=True)
                            thread.start()
                            # Start traffic monitoring for srv mode
                            if user.get('mode') == 'srv':
                                traffic_thread = threading.Thread(target=read_traffic_stats, args=(uid,), daemon=True)
                                traffic_thread.start()
                            container_exists = True
                        else:
                            # Container exists but stopped, remove it
                            try:
                                container.remove()
                            except:
                                pass
                    except:
                        pass

                # If container doesn't exist or was stopped, restart it
                if not container_exists:
                    print(f"Restarting instance {uid} ({user.get('client_id')})")
                    try:
                        start_olcrtc_container(uid)
                    except Exception as e:
                        print(f"Failed to restart instance {uid}: {e}")
                        user['state'] = 'stopped'
                        user['container_id'] = None
        save_users()
    else:
        users = {}

def save_users():
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    default_config = {
        'username': 'admin',
        'password': 'admin',
        'dns': '1.1.1.1:53',
        'debug': False
    }
    save_config(default_config)
    return default_config

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'No token provided'}), 401

        try:
            if token.startswith('Bearer '):
                token = token[7:]
            jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    config = load_config()
    if username == config.get('username', 'admin') and password == config.get('password', 'admin'):
        token = jwt.encode({
            'username': username,
            'exp': datetime.utcnow() + timedelta(days=7)
        }, SECRET_KEY, algorithm='HS256')
        return jsonify({'token': token})

    return jsonify({'error': 'Invalid credentials'}), 401

def build_olcrtc_command(user):
    cmd = [
        '-mode', user.get('mode', 'cnc'),
        '-carrier', user['carrier'],
        '-transport', user['transport'],
        '-link', 'direct',
        '-data', '/data',
        '-id', user['room_id'],
        '-client-id', user['client_id'],
        '-key', user['key'],
        '-dns', user.get('dns', '1.1.1.1:53')
    ]

    if user.get('mode') == 'cnc':
        cmd.extend(['-socks-host', '0.0.0.0'])
        cmd.extend(['-socks-port', str(user.get('socks_port', 1080))])
    elif user.get('mode') == 'srv':
        # For srv mode, use local SOCKS5 proxy for traffic control
        cmd.extend(['-socks-proxy', '127.0.0.1'])
        cmd.extend(['-socks-proxy-port', '1081'])

    transport_params = user.get('transport_params', {})
    for key, value in transport_params.items():
        if value is not None and value != '':
            cmd.extend([f'-{key}', str(value)])

    config = load_config()
    if config.get('debug') or user.get('debug'):
        cmd.append('--debug')

    return cmd

def read_container_logs(uid, container):
    logs[uid] = deque(maxlen=1000)
    try:
        for line in container.logs(stream=True, follow=True):
            with lock:
                log_line = line.decode('utf-8', errors='ignore').strip()
                logs[uid].append(log_line)
    except:
        pass

def read_traffic_stats(uid):
    """Read traffic statistics from SOCKS5 proxy stats file"""
    print(f"Starting traffic monitoring for instance {uid}", flush=True)

    stats_file_path = '/tmp/socks.stats'

    while uid in containers:
        try:
            container = docker_client.containers.get(containers[uid])
            if container.status != 'running':
                print(f"Container {uid} not running, stopping traffic monitoring", flush=True)
                break

            # Check if stats file exists
            test_result = container.exec_run(f'test -f {stats_file_path}', demux=False)
            if test_result.exit_code != 0:
                # File doesn't exist yet, wait for next iteration
                time.sleep(5)
                continue

            exec_result = container.exec_run(f'cat {stats_file_path}', demux=False)

            if exec_result.exit_code == 0:
                stats_data = exec_result.output.decode('utf-8', errors='ignore').strip()
                print(f"Raw stats data for {uid}: {stats_data}", flush=True)

                if stats_data:
                    try:
                        # Parse stats format: "rx_bytes tx_bytes"
                        parts = stats_data.split()
                        if len(parts) >= 2:
                            rx_bytes = int(parts[0])
                            tx_bytes = int(parts[1])
                            current_time = time.time()

                            with lock:
                                # Calculate speed if we have previous data
                                rx_speed = 0
                                tx_speed = 0
                                if uid in traffic_stats:
                                    prev_stats = traffic_stats[uid]
                                    time_diff = current_time - prev_stats['last_update']
                                    if time_diff > 0:
                                        rx_speed = (rx_bytes - prev_stats['rx_bytes']) / time_diff / 1024  # KB/s
                                        tx_speed = (tx_bytes - prev_stats['tx_bytes']) / time_diff / 1024  # KB/s

                                traffic_stats[uid] = {
                                    'rx_bytes': rx_bytes,
                                    'tx_bytes': tx_bytes,
                                    'rx_mb': round(rx_bytes / 1024 / 1024, 2),
                                    'tx_mb': round(tx_bytes / 1024 / 1024, 2),
                                    'total_mb': round((rx_bytes + tx_bytes) / 1024 / 1024, 2),
                                    'rx_speed': round(rx_speed, 2),
                                    'tx_speed': round(tx_speed, 2),
                                    'last_update': current_time
                                }
                                print(f"Updated traffic stats for {uid}: RX={traffic_stats[uid]['rx_mb']}MB TX={traffic_stats[uid]['tx_mb']}MB Speed: RX={traffic_stats[uid]['rx_speed']}KB/s TX={traffic_stats[uid]['tx_speed']}KB/s", flush=True)
                    except (ValueError, IndexError) as e:
                        print(f"Error parsing traffic stats for {uid}: {e}", flush=True)
        except Exception as e:
            print(f"Error reading traffic stats for {uid}: {e}", flush=True)

        time.sleep(5)

    print(f"Stopping traffic monitoring for instance {uid}", flush=True)
    with lock:
        if uid in traffic_stats:
            del traffic_stats[uid]

def start_olcrtc_container(uid):
    with lock:
        if uid in containers:
            try:
                container = docker_client.containers.get(containers[uid])
                if container.status == 'running':
                    # Container already running, just ensure log thread exists
                    if uid not in logs or len(logs[uid]) == 0:
                        thread = threading.Thread(target=read_container_logs, args=(uid, container), daemon=True)
                        thread.start()
                    return True
                container.remove()
            except:
                pass

        user = users[uid]
        cmd = build_olcrtc_command(user)

        port_bindings = {}
        if user.get('mode') == 'cnc':
            socks_port = user.get('socks_port', 1080)
            port_bindings[1080] = socks_port

        # Environment variables for SOCKS5 proxy (srv mode only)
        environment = {}
        if user.get('mode') == 'srv':
            # Use port 88XX where XX is the instance ID
            socks_port = 8800 + int(uid)
            environment['SOCKS_PORT'] = '1081'
            environment['RX_LIMIT'] = str(user.get('rx_limit', 0))
            environment['TX_LIMIT'] = str(user.get('tx_limit', 0))
            # Expose SOCKS5 proxy port
            port_bindings[1081] = socks_port
            users[uid]['socks_port'] = socks_port

        try:
            container = docker_client.containers.run(
                'olcrtc:latest',
                command=cmd,
                detach=True,
                name=f'olcrtc-{uid}',
                ports=port_bindings,
                environment=environment,
                remove=False,
                network_mode='bridge'
            )

            containers[uid] = container.id
            users[uid]['state'] = 'running'
            users[uid]['container_id'] = container.id
            save_users()

            thread = threading.Thread(target=read_container_logs, args=(uid, container), daemon=True)
            thread.start()

            # Start traffic monitoring for srv mode
            if user.get('mode') == 'srv':
                traffic_thread = threading.Thread(target=read_traffic_stats, args=(uid,), daemon=True)
                traffic_thread.start()

            return True
        except Exception as e:
            print(f"Error starting container: {e}")
            return False

def stop_olcrtc_container(uid):
    with lock:
        if uid in containers:
            try:
                container = docker_client.containers.get(containers[uid])
                container.stop(timeout=5)
                container.remove()
            except:
                pass
            del containers[uid]

        if uid in users:
            users[uid]['state'] = 'stopped'
            users[uid]['container_id'] = None
            save_users()

        return True

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'timestamp': time.time()})

@app.route('/api/status', methods=['GET'])
@require_auth
def status():
    with lock:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()

        user_list = []
        for uid, user in users.items():
            user_data = {
                'id': uid,
                'client_id': user['client_id'],
                'carrier': user.get('carrier', 'wbstream'),
                'transport': user.get('transport', 'datachannel'),
                'mode': user.get('mode', 'cnc'),
                'state': user.get('state', 'stopped'),
                'container_id': user.get('container_id'),
                'socks_port': user.get('socks_port', 1080)
            }
            user_list.append(user_data)

        return jsonify({
            'users': user_list,
            'server': {
                'cpu_percent': cpu_percent,
                'mem_percent': mem.percent,
                'mem_used': mem.used,
                'mem_total': mem.total
            }
        })

@app.route('/api/carriers', methods=['GET'])
@require_auth
def get_carriers():
    return jsonify({'carriers': CARRIERS})

@app.route('/api/transports', methods=['GET'])
@require_auth
def get_transports():
    return jsonify({'transports': TRANSPORTS})

@app.route('/api/transport-params/<transport>', methods=['GET'])
@require_auth
def get_transport_params(transport):
    params = TRANSPORT_PARAMS.get(transport, [])
    return jsonify({'params': params})

@app.route('/api/users/add', methods=['POST'])
@require_auth
def add_user():
    data = request.json

    required = ['client_id', 'key', 'room_id', 'carrier', 'transport']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    with lock:
        uid = str(len(users) + 1)
        users[uid] = {
            'client_id': data['client_id'],
            'key': data['key'],
            'room_id': data['room_id'],
            'carrier': data['carrier'],
            'transport': data['transport'],
            'mode': data.get('mode', 'cnc'),
            'socks_port': data.get('socks_port', 1080 + len(users)),
            'transport_params': data.get('transport_params', {}),
            'debug': data.get('debug', False),
            'profile_name': data.get('profile_name', ''),
            'dns': data.get('dns', '1.1.1.1:53'),
            'state': 'stopped',
            'container_id': None
        }
        save_users()

    return jsonify({'success': True, 'uid': uid})

@app.route('/api/users/delete/<uid>', methods=['POST'])
@require_auth
def delete_user(uid):
    with lock:
        stop_olcrtc_container(uid)
        if uid in users:
            del users[uid]
            save_users()
        if uid in logs:
            del logs[uid]

    return jsonify({'success': True})

@app.route('/api/users/get/<uid>', methods=['GET'])
@require_auth
def get_user(uid):
    if uid not in users:
        return jsonify({'error': 'User not found'}), 404

    user = users[uid]
    return jsonify({
        'client_id': user.get('client_id', ''),
        'carrier': user.get('carrier', 'wbstream'),
        'transport': user.get('transport', 'datachannel'),
        'mode': user.get('mode', 'srv'),
        'socks_port': user.get('socks_port', 1080),
        'transport_params': user.get('transport_params', {}),
        'debug': user.get('debug', False),
        'profile_name': user.get('profile_name', ''),
        'dns': user.get('dns', '1.1.1.1:53')
    })

@app.route('/api/users/update/<uid>', methods=['POST'])
@require_auth
def update_user(uid):
    if uid not in users:
        return jsonify({'error': 'User not found'}), 404

    data = request.json

    with lock:
        user = users[uid]

        # Update fields
        if data.get('client_id'):
            user['client_id'] = data['client_id']
        if data.get('key'):
            user['key'] = data['key']
        if data.get('room_id'):
            user['room_id'] = data['room_id']
        if data.get('carrier'):
            user['carrier'] = data['carrier']
        if data.get('transport'):
            user['transport'] = data['transport']
        if data.get('mode'):
            user['mode'] = data['mode']
        if data.get('socks_port'):
            user['socks_port'] = data['socks_port']
        if 'transport_params' in data:
            user['transport_params'] = data['transport_params']
        if 'debug' in data:
            user['debug'] = data['debug']
        if 'profile_name' in data:
            user['profile_name'] = data['profile_name']
        if data.get('dns'):
            user['dns'] = data['dns']

        save_users()

        # Restart container if it was running
        if user.get('state') == 'running':
            stop_olcrtc_container(uid)
            start_olcrtc_container(uid)

    return jsonify({'success': True})

@app.route('/api/users/start/<uid>', methods=['POST'])
@require_auth
def start_user(uid):
    if uid not in users:
        return jsonify({'error': 'User not found'}), 404

    success = start_olcrtc_container(uid)
    return jsonify({'success': success})

@app.route('/api/users/stop/<uid>', methods=['POST'])
@require_auth
def stop_user(uid):
    if uid not in users:
        return jsonify({'error': 'User not found'}), 404

    success = stop_olcrtc_container(uid)
    return jsonify({'success': success})

@app.route('/api/users/logs/<uid>', methods=['GET'])
@require_auth
def get_logs(uid):
    with lock:
        if uid in logs:
            return jsonify({'logs': list(logs[uid])})
        return jsonify({'logs': []})

@app.route('/api/config', methods=['GET'])
@require_auth
def get_config():
    config = load_config()
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
@require_auth
def update_config():
    config = request.json
    save_config(config)
    return jsonify({'success': True})

@app.route('/api/generate-room-ids', methods=['POST'])
@require_auth
def generate_room_ids():
    data = request.json
    carrier = data.get('carrier', 'wbstream')
    amount = data.get('amount', 1)
    dns = data.get('dns', '1.1.1.1:53')

    if carrier not in ['wbstream', 'jazz']:
        return jsonify({'error': 'Only wbstream and jazz support room generation'}), 400

    try:
        container = docker_client.containers.run(
            'olcrtc:latest',
            command=[
                '-mode', 'gen',
                '-carrier', carrier,
                '-dns', dns,
                '-amount', str(amount)
            ],
            environment={},  # No SOCKS proxy for generation mode
            remove=True,
            detach=False,
            stdout=True,
            stderr=False  # Ignore stderr to avoid debug messages
        )

        output = container.decode('utf-8', errors='ignore')
        room_ids = [line.strip() for line in output.strip().split('\n') if line.strip()]

        return jsonify({'success': True, 'room_ids': room_ids})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-uri/<uid>', methods=['GET'])
@require_auth
def generate_uri(uid):
    if uid not in users:
        return jsonify({'error': 'User not found'}), 404

    user = users[uid]

    params_str = ''
    if user.get('transport_params'):
        params_list = [f"{k}={v}" for k, v in user['transport_params'].items() if v]
        if params_list:
            params_str = '<' + '&'.join(params_list) + '>'

    uri = f"olcrtc://{user['carrier']}?{user['transport']}{params_str}@{user['room_id']}#{user['key']}%{user['client_id']}"

    if user.get('profile_name'):
        uri += f"${user['profile_name']}"

    return jsonify({'uri': uri})

@app.route('/api/users/traffic/<uid>', methods=['GET'])
@require_auth
def get_traffic(uid):
    with lock:
        if uid in traffic_stats:
            return jsonify(traffic_stats[uid])
        return jsonify({'rx_bytes': 0, 'tx_bytes': 0, 'rx_mb': 0, 'tx_mb': 0, 'total_mb': 0, 'rx_speed': 0, 'tx_speed': 0})

@app.route('/api/subscription/<client_id>', methods=['GET'])
def get_subscription(client_id):
    """Generate subscription file for specific client_id"""
    with lock:
        # Find all running instances with this client_id
        instances = []
        for uid, user in users.items():
            if user.get('state') != 'running':
                continue
            if user.get('client_id') != client_id:
                continue

            # Build URI
            params_str = ''
            if user.get('transport_params'):
                params_list = [f"{k}={v}" for k, v in user['transport_params'].items() if v]
                if params_list:
                    params_str = '<' + '&'.join(params_list) + '>'

            uri = f"olcrtc://{user['carrier']}?{user['transport']}{params_str}@{user['room_id']}#{user['key']}%{client_id}"
            if user.get('profile_name'):
                uri += f"${user['profile_name']}"

            # Get traffic stats
            traffic = traffic_stats.get(uid, {})
            used_mb = traffic.get('total_mb', 0)

            instances.append({
                'uri': uri,
                'name': user.get('profile_name') or f"Instance {uid}",
                'used': f"{used_mb}mb",
                'mode': user.get('mode', 'srv'),
                'transport': user.get('transport', 'datachannel'),
                'carrier': user.get('carrier', 'wbstream')
            })

        if not instances:
            return Response("# No running instances found for this client_id\n", mimetype='text/plain')

        # Build subscription file content
        lines = []
        lines.append(f"#name: {client_id}")
        lines.append(f"#update: {int(time.time())}")
        lines.append(f"#refresh: 5m")
        lines.append(f"#color: #22c55e")
        lines.append("")

        for instance in instances:
            lines.append(instance['uri'])
            lines.append(f"##name: {instance['name']}")
            lines.append(f"##used: {instance['used']}")
            lines.append(f"##comment: {instance['mode']} mode, {instance['transport']} transport, {instance['carrier']} carrier")
            lines.append("")

        content = '\n'.join(lines)
        return Response(content, mimetype='text/plain')

@app.route('/api/subscription/list', methods=['GET'])
@require_auth
def list_subscriptions():
    """List all available client_ids with running instances"""
    with lock:
        client_ids = set()
        for user in users.values():
            if user.get('state') == 'running' and user.get('client_id'):
                client_ids.add(user['client_id'])

        return jsonify({'client_ids': sorted(list(client_ids))})

if __name__ == '__main__':
    load_users()
    app.run(host='0.0.0.0', port=3001, debug=False)
