import os
import json
import docker
from flask import Flask, jsonify, request
from functools import wraps

app = Flask(__name__)
docker_client = docker.DockerClient(base_url='unix://var/run/docker.sock')

# Node authentication token
NODE_TOKEN = os.environ.get('NODE_TOKEN', 'change-me-in-production')

def require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('X-Node-Token')
        if not token or token != NODE_TOKEN:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'docker': docker_client.ping()})

@app.route('/containers', methods=['GET'])
@require_token
def list_containers():
    """List all OlcRTC containers on this node"""
    try:
        containers = docker_client.containers.list(all=True, filters={'name': 'olcrtc-'})
        result = []
        for container in containers:
            result.append({
                'id': container.id[:12],
                'name': container.name,
                'status': container.status,
                'image': container.image.tags[0] if container.image.tags else 'unknown'
            })
        return jsonify({'containers': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/containers/start', methods=['POST'])
@require_token
def start_container():
    """Start a new OlcRTC container"""
    try:
        data = request.json
        container = docker_client.containers.run(
            data.get('image', 'olcrtc:latest'),
            command=data.get('command', []),
            detach=True,
            name=data.get('name'),
            ports=data.get('ports', {}),
            environment=data.get('environment', {}),
            remove=False,
            network_mode=data.get('network_mode', 'bridge')
        )
        return jsonify({'container_id': container.id, 'status': 'started'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/containers/<container_id>/stop', methods=['POST'])
@require_token
def stop_container(container_id):
    """Stop a container"""
    try:
        container = docker_client.containers.get(container_id)
        container.stop(timeout=5)
        container.remove()
        return jsonify({'status': 'stopped'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/containers/<container_id>/logs', methods=['GET'])
@require_token
def get_container_logs(container_id):
    """Get container logs"""
    try:
        container = docker_client.containers.get(container_id)
        logs = container.logs(tail=1000).decode('utf-8', errors='ignore')
        return jsonify({'logs': logs.split('\n')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
@require_token
def get_stats():
    """Get node system stats"""
    try:
        import psutil
        return jsonify({
            'cpu_percent': psutil.cpu_percent(interval=1),
            'memory_percent': psutil.virtual_memory().percent,
            'disk_percent': psutil.disk_usage('/').percent
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3002, debug=False)
