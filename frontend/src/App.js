import React, { useState, useEffect } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import {
  Play,
  Square,
  Edit,
  Trash2,
  Copy,
  Plus,
  Dice5,
  LogOut,
  Server,
  Cpu,
  Activity,
  Terminal,
  X,
  QrCode as QrCodeIcon
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select } from './components/ui/select';
import { Badge } from './components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';

function App() {
  // All existing state from original App.js
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [users, setUsers] = useState([]);
  const [serverStats, setServerStats] = useState({ cpu_percent: 0, mem_percent: 0 });
  const [selectedUser, setSelectedUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [trafficStats, setTrafficStats] = useState({});
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [subscriptionUrls, setSubscriptionUrls] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [genConfig, setGenConfig] = useState({
    carrier: 'wbstream',
    amount: 1,
    dns: '1.1.1.1:53'
  });
  const [generatedRooms, setGeneratedRooms] = useState(() => {
    const saved = localStorage.getItem('generatedRooms');
    return saved ? JSON.parse(saved) : [];
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [transports, setTransports] = useState([]);
  const [transportParams, setTransportParams] = useState([]);
  const [newUser, setNewUser] = useState({
    client_id: '',
    key: '',
    room_id: '',
    carrier: 'wbstream',
    transport: 'datachannel',
    mode: 'srv',
    socks_port: 1080,
    transport_params: {},
    debug: false,
    profile_name: '',
    dns: '1.1.1.1:53',
    rx_limit: 0,
    tx_limit: 0
  });

  // Copy all useEffect hooks and functions from original
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCarriers();
      fetchTransports();
      fetchStatus();
      const interval = setInterval(() => {
        if (autoRefresh) {
          fetchStatus();
          if (selectedUser) {
            fetchLogs(selectedUser);
          }
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedUser, isAuthenticated]);

  // Separate effect for traffic stats that depends on users
  useEffect(() => {
    if (isAuthenticated && users.length > 0) {
      fetchTrafficStats();
      const interval = setInterval(() => {
        if (autoRefresh) {
          fetchTrafficStats();
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, autoRefresh, users.length]);

  useEffect(() => {
    if (newUser.transport && isAuthenticated) {
      fetchTransportParams(newUser.transport);
    }
  }, [newUser.transport, isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/login', loginData);
      const token = response.data.token;
      localStorage.setItem('auth_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
      setLoginError('');
    } catch (err) {
      setLoginError('Неверный логин или пароль');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    delete axios.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setLoginData({ username: '', password: '' });
  };

  const fetchCarriers = async () => {
    try {
      const response = await axios.get('/api/carriers');
      setCarriers(response.data.carriers);
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    }
  };

  const fetchTransports = async () => {
    try {
      const response = await axios.get('/api/transports');
      setTransports(response.data.transports);
    } catch (err) {
      console.error('Failed to fetch transports:', err);
    }
  };

  const fetchTransportParams = async (transport) => {
    try {
      const response = await axios.get(`/api/transport-params/${transport}`);
      setTransportParams(response.data.params);
      const defaultParams = {};
      response.data.params.forEach(param => {
        defaultParams[param.name] = param.default;
      });
      setNewUser(prev => ({ ...prev, transport_params: defaultParams }));
    } catch (err) {
      console.error('Failed to fetch transport params:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/status');
      setUsers(response.data.users);
      setServerStats(response.data.server);

      // Initialize collapsed groups - all collapsed by default
      const initialCollapsed = {};
      response.data.users.forEach(user => {
        const clientId = user.client_id || 'unknown';
        if (!(clientId in initialCollapsed)) {
          initialCollapsed[clientId] = true;
        }
      });
      setCollapsedGroups(prev => ({ ...initialCollapsed, ...prev }));
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    }
  };

  const fetchLogs = async (uid) => {
    try {
      const response = await axios.get(`/api/users/logs/${uid}`);
      setLogs(response.data.logs);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const fetchTrafficStats = async () => {
    try {
      const stats = {};
      for (const user of users) {
        if (user.state === 'running' && user.mode === 'srv') {
          const response = await axios.get(`/api/users/traffic/${user.id}`);
          stats[user.id] = response.data;
        }
      }
      setTrafficStats(stats);
    } catch (err) {
      console.error('Failed to fetch traffic stats:', err);
    }
  };

  const generateKey = () => {
    const chars = '0123456789abcdef';
    let key = '';
    for (let i = 0; i < 64; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewUser({ ...newUser, key });
  };

  const showNotification = (message, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  const generateRoomIds = async () => {
    setIsGenerating(true);
    try {
      const response = await axios.post('/api/generate-room-ids', genConfig);
      const newRooms = response.data.room_ids;
      const updatedRooms = [...generatedRooms, ...newRooms];
      setGeneratedRooms(updatedRooms);
      localStorage.setItem('generatedRooms', JSON.stringify(updatedRooms));
      showNotification(`Сгенерировано ${newRooms.length} Room ID`);
    } catch (err) {
      showNotification('Ошибка генерации Room ID', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const removeRoomId = (index) => {
    const updatedRooms = generatedRooms.filter((_, i) => i !== index);
    setGeneratedRooms(updatedRooms);
    localStorage.setItem('generatedRooms', JSON.stringify(updatedRooms));
    showNotification('Room ID удалён');
  };

  const copyToClipboard = async (text, label = 'Текст') => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        showNotification(`${label} скопирован!`);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification(`${label} скопирован!`);
      }
    } catch (err) {
      showNotification(`Ошибка копирования: ${err.message}`, 'error');
    }
  };

  const addUser = async () => {
    if (!newUser.client_id || !newUser.key || !newUser.room_id) {
      showNotification('Заполни Client ID, Key и Room ID!', 'error');
      return;
    }
    try {
      await axios.post('/api/users/add', newUser);
      setNewUser({
        client_id: '',
        key: '',
        room_id: '',
        carrier: 'wbstream',
        transport: 'datachannel',
        mode: 'srv',
        socks_port: 1080 + users.length,
        transport_params: {},
        debug: false,
        profile_name: '',
        dns: '1.1.1.1:53'
      });
      setShowAddForm(false);
      fetchStatus();
      showNotification('Инстанс создан');
    } catch (err) {
      showNotification('Ошибка добавления', 'error');
    }
  };

  const deleteUser = async (uid) => {
    if (!window.confirm('Точно удалить?')) return;
    try {
      await axios.post(`/api/users/delete/${uid}`);
      if (selectedUser === uid) {
        setSelectedUser(null);
        setLogs([]);
      }
      fetchStatus();
      showNotification('Инстанс удалён');
    } catch (err) {
      showNotification('Ошибка удаления', 'error');
    }
  };

  const editUser = async (user) => {
    try {
      const response = await axios.get(`/api/users/get/${user.id}`);
      const userData = response.data;
      setEditingUser({
        id: user.id,
        client_id: userData.client_id || '',
        key: '',
        room_id: '',
        carrier: userData.carrier || 'wbstream',
        transport: userData.transport || 'datachannel',
        mode: userData.mode || 'srv',
        socks_port: userData.socks_port || 1080,
        transport_params: userData.transport_params || {},
        debug: userData.debug || false,
        profile_name: userData.profile_name || '',
        dns: userData.dns || '1.1.1.1:53'
      });
      setShowEditForm(true);
      fetchTransportParams(userData.transport || 'datachannel');
    } catch (err) {
      showNotification('Ошибка загрузки данных', 'error');
    }
  };

  const updateUser = async () => {
    if (!editingUser.client_id) {
      showNotification('Заполни Client ID!', 'error');
      return;
    }
    try {
      await axios.post(`/api/users/update/${editingUser.id}`, editingUser);
      setEditingUser(null);
      setShowEditForm(false);
      fetchStatus();
      showNotification('Инстанс обновлён');
    } catch (err) {
      showNotification('Ошибка обновления', 'error');
    }
  };

  const startUser = async (uid) => {
    try {
      await axios.post(`/api/users/start/${uid}`);
      fetchStatus();
    } catch (err) {
      showNotification('Ошибка запуска', 'error');
    }
  };

  const stopUser = async (uid) => {
    try {
      await axios.post(`/api/users/stop/${uid}`);
      fetchStatus();
    } catch (err) {
      showNotification('Ошибка остановки', 'error');
    }
  };

  const selectUser = (uid) => {
    setSelectedUser(uid);
    fetchLogs(uid);
  };

  const generateUri = async (uid) => {
    try {
      const response = await axios.get(`/api/generate-uri/${uid}`);
      await copyToClipboard(response.data.uri, 'URI');
    } catch (err) {
      showNotification('Ошибка генерации URI', 'error');
    }
  };

  const generateQrCode = async (uid) => {
    try {
      const response = await axios.get(`/api/generate-uri/${uid}`);
      const uri = response.data.uri;

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(uri, {
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      const user = users.find(u => u.id === uid);
      setQrCodeData({
        uri,
        qrImage: qrDataUrl,
        instanceId: uid,
        clientId: user?.client_id || 'Unknown'
      });
      setShowQrDialog(true);
    } catch (err) {
      showNotification('Ошибка генерации QR кода', 'error');
    }
  };

  const downloadQrCode = () => {
    if (!qrCodeData) return;

    const link = document.createElement('a');
    link.download = `olcrtc-qr-${qrCodeData.instanceId}.png`;
    link.href = qrCodeData.qrImage;
    link.click();
    showNotification('QR код скачан');
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold text-center">OlcPanel</CardTitle>
            <CardDescription className="text-center">
              Управление OlcRTC инстансами
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Логин</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                />
              </div>
              {loginError && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {loginError}
                </div>
              )}
              <Button type="submit" className="w-full">
                Войти
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6" />
            <h1 className="text-2xl font-bold">OlcPanel</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Cpu className="h-4 w-4" />
                <span>CPU: {serverStats.cpu_percent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                <span>RAM: {serverStats.mem_percent.toFixed(1)}%</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Выход
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Instances */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex gap-2">
              <Button onClick={() => setShowAddForm(true)} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
              <Button onClick={() => setShowGenForm(true)} variant="outline" className="flex-1">
                <Dice5 className="h-4 w-4 mr-2" />
                Генератор
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    const response = await axios.get('/api/subscription/list');
                    const clientIds = response.data.client_ids;
                    if (clientIds.length === 0) {
                      showNotification('Нет запущенных инстансов', 'error');
                      return;
                    }
                    const urls = clientIds.map(id => ({
                      clientId: id,
                      url: `${window.location.origin}/api/subscription/${id}`
                    }));
                    setSubscriptionUrls(urls);
                    setShowSubscriptionDialog(true);
                  } catch (err) {
                    showNotification('Ошибка получения subscription URLs', 'error');
                  }
                }}
                variant="secondary"
                className="flex-1"
              >
                <Copy className="h-4 w-4 mr-2" />
                Subscription URL
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Инстансы ({users.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[calc(100vh-20rem)] overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Нет инстансов
                  </p>
                ) : (
                  (() => {
                    // Group users by client_id
                    const grouped = users.reduce((acc, user) => {
                      const clientId = user.client_id || 'unknown';
                      if (!acc[clientId]) acc[clientId] = [];
                      acc[clientId].push(user);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([clientId, groupUsers]) => (
                      <div key={clientId} className="space-y-2">
                        {/* Group Header */}
                        <div
                          className="flex items-center justify-between p-2 bg-muted rounded hover:bg-muted/80"
                        >
                          <div
                            className="flex items-center gap-2 flex-1 cursor-pointer"
                            onClick={() => setCollapsedGroups(prev => ({
                              ...prev,
                              [clientId]: !prev[clientId]
                            }))}
                          >
                            <span className="text-sm font-semibold">{clientId}</span>
                            <Badge variant="outline">{groupUsers.length}</Badge>
                            <span className="text-xs ml-auto">
                              {collapsedGroups[clientId] ? '▶' : '▼'}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/api/subscription/${clientId}`;
                              navigator.clipboard.writeText(url);
                              showNotification(`Subscription URL для ${clientId} скопирован`);
                            }}
                            className="ml-2"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Group Items */}
                        {!collapsedGroups[clientId] && groupUsers.map(user => (
                          <Card
                            key={user.id}
                            className={`cursor-pointer transition-colors ml-4 ${
                              selectedUser === user.id ? 'border-primary' : ''
                            }`}
                            onClick={() => selectUser(user.id)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <span className="font-mono text-sm">#{user.id}</span>
                                <Badge variant={user.state === 'running' ? 'success' : 'secondary'}>
                                  {user.state === 'running' ? 'Running' : 'Stopped'}
                                </Badge>
                              </div>
                              <div className="space-y-1 text-sm mb-3">
                                <div><span className="text-muted-foreground">Carrier:</span> {user.carrier}</div>
                                <div><span className="text-muted-foreground">Transport:</span> {user.transport}</div>
                                {user.mode === 'cnc' && (
                                  <div><span className="text-muted-foreground">SOCKS:</span> :{user.socks_port}</div>
                                )}
                                {user.mode === 'srv' && user.socks_port && (
                                  <div><span className="text-muted-foreground">SOCKS:</span> :{user.socks_port}</div>
                                )}
                                {user.state === 'running' && user.mode === 'srv' && trafficStats[user.id] && (
                                  <>
                                    <div className="text-xs text-primary">
                                      <span className="text-muted-foreground">Traffic:</span> ↓{trafficStats[user.id].rx_mb} MB / ↑{trafficStats[user.id].tx_mb} MB
                                    </div>
                                    <div className="text-xs text-green-500">
                                      <span className="text-muted-foreground">Speed:</span> ↓{trafficStats[user.id].rx_speed} KB/s / ↑{trafficStats[user.id].tx_speed} KB/s
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex gap-1">
                                {user.state === 'running' ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={(e) => { e.stopPropagation(); stopUser(user.id); }}
                                    className="flex-1"
                                  >
                                    <Square className="h-3 w-3 mr-1" />
                                    Stop
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); startUser(user.id); }}
                                    className="flex-1"
                                  >
                                    <Play className="h-3 w-3 mr-1" />
                                    Start
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); editUser(user); }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); generateQrCode(user.id); }}
                                >
                                  <QrCodeIcon className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); deleteUser(user.id); }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ));
                  })()
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right panel - Logs */}
          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-12rem)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  {selectedUser ? `Логи инстанса #${selectedUser}` : 'Логи'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedUser ? (
                  <div className="bg-black text-green-400 p-4 rounded-md font-mono text-sm h-[calc(100vh-18rem)] overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-gray-500">Логов нет</div>
                    ) : (
                      logs.map((log, idx) => (
                        <div key={idx}>{log}</div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[calc(100vh-18rem)] text-muted-foreground">
                    <Terminal className="h-12 w-12 mb-4" />
                    <p>Выберите инстанс для просмотра логов</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={`px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-right ${
              notif.type === 'error'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {notif.message}
          </div>
        ))}
      </div>

      {/* Add Instance Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent onClose={() => setShowAddForm(false)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить инстанс</DialogTitle>
            <DialogDescription>Создайте новый OlcRTC инстанс</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                placeholder="my-client"
                value={newUser.client_id}
                onChange={(e) => setNewUser({ ...newUser, client_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="room_id">Room ID</Label>
              <Input
                id="room_id"
                placeholder="room-id"
                value={newUser.room_id}
                onChange={(e) => setNewUser({ ...newUser, room_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key">Encryption Key (64 hex chars)</Label>
              <div className="flex gap-2">
                <Input
                  id="key"
                  placeholder="64 символа hex"
                  value={newUser.key}
                  onChange={(e) => setNewUser({ ...newUser, key: e.target.value })}
                  className="flex-1"
                />
                <Button onClick={generateKey} variant="outline">
                  Генерировать
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile_name">Profile Name (опционально)</Label>
              <Input
                id="profile_name"
                placeholder="My Profile"
                value={newUser.profile_name}
                onChange={(e) => setNewUser({ ...newUser, profile_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="carrier">Carrier</Label>
                <Select
                  id="carrier"
                  value={newUser.carrier}
                  onChange={(e) => setNewUser({ ...newUser, carrier: e.target.value })}
                >
                  {carriers.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transport">Transport</Label>
                <Select
                  id="transport"
                  value={newUser.transport}
                  onChange={(e) => setNewUser({ ...newUser, transport: e.target.value })}
                >
                  {transports.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dns">DNS Server</Label>
              <Input
                id="dns"
                placeholder="1.1.1.1:53"
                value={newUser.dns}
                onChange={(e) => setNewUser({ ...newUser, dns: e.target.value })}
              />
            </div>

            {transportParams.length > 0 && (
              <div className="space-y-2 p-4 border rounded-lg">
                <h3 className="font-semibold">Параметры транспорта</h3>
                {transportParams.map(param => (
                  <div key={param.name} className="space-y-2">
                    <Label>{param.label}</Label>
                    {param.type === 'select' ? (
                      <Select
                        value={newUser.transport_params[param.name] || param.default}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          transport_params: { ...newUser.transport_params, [param.name]: e.target.value }
                        })}
                      >
                        {param.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </Select>
                    ) : param.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={newUser.transport_params[param.name] || param.default}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          transport_params: { ...newUser.transport_params, [param.name]: e.target.checked }
                        })}
                        className="rounded"
                      />
                    ) : (
                      <Input
                        type="text"
                        value={newUser.transport_params[param.name] || param.default}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          transport_params: { ...newUser.transport_params, [param.name]: e.target.value }
                        })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <Select
                  id="mode"
                  value={newUser.mode}
                  onChange={(e) => setNewUser({ ...newUser, mode: e.target.value })}
                >
                  <option value="srv">Server (srv)</option>
                  <option value="cnc">Client (cnc)</option>
                </Select>
              </div>

              {newUser.mode === 'cnc' && (
                <div className="space-y-2">
                  <Label htmlFor="socks_port">SOCKS5 Port</Label>
                  <Input
                    id="socks_port"
                    type="number"
                    value={newUser.socks_port}
                    onChange={(e) => setNewUser({ ...newUser, socks_port: parseInt(e.target.value) })}
                  />
                </div>
              )}
            </div>

            {newUser.mode === 'srv' && (
              <div className="space-y-2 p-4 border rounded-lg">
                <h3 className="font-semibold">Ограничение скорости (KB/s)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rx_limit">RX Limit (Download)</Label>
                    <Input
                      id="rx_limit"
                      type="number"
                      placeholder="0 = без ограничений"
                      value={newUser.rx_limit || 0}
                      onChange={(e) => setNewUser({ ...newUser, rx_limit: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tx_limit">TX Limit (Upload)</Label>
                    <Input
                      id="tx_limit"
                      type="number"
                      placeholder="0 = без ограничений"
                      value={newUser.tx_limit || 0}
                      onChange={(e) => setNewUser({ ...newUser, tx_limit: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="debug"
                checked={newUser.debug}
                onChange={(e) => setNewUser({ ...newUser, debug: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="debug" className="cursor-pointer">Debug Mode</Label>
            </div>

            <Button onClick={addUser} className="w-full">
              Создать инстанс
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Instance Dialog */}
      <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
        <DialogContent onClose={() => setShowEditForm(false)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editingUser && (
            <>
              <DialogHeader>
                <DialogTitle>Редактировать инстанс #{editingUser.id}</DialogTitle>
                <DialogDescription>Изменить параметры инстанса</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_client_id">Client ID</Label>
                  <Input
                    id="edit_client_id"
                    value={editingUser.client_id}
                    onChange={(e) => setEditingUser({ ...editingUser, client_id: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_key">Encryption Key (оставь пустым чтобы не менять)</Label>
                  <Input
                    id="edit_key"
                    placeholder="Не изменять"
                    value={editingUser.key}
                    onChange={(e) => setEditingUser({ ...editingUser, key: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_room_id">Room ID (оставь пустым чтобы не менять)</Label>
                  <Input
                    id="edit_room_id"
                    placeholder="Не изменять"
                    value={editingUser.room_id}
                    onChange={(e) => setEditingUser({ ...editingUser, room_id: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_carrier">Carrier</Label>
                    <Select
                      id="edit_carrier"
                      value={editingUser.carrier}
                      onChange={(e) => setEditingUser({ ...editingUser, carrier: e.target.value })}
                    >
                      {carriers.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit_transport">Transport</Label>
                    <Select
                      id="edit_transport"
                      value={editingUser.transport}
                      onChange={(e) => {
                        setEditingUser({ ...editingUser, transport: e.target.value, transport_params: {} });
                        fetchTransportParams(e.target.value);
                      }}
                    >
                      {transports.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                </div>

                {transportParams.length > 0 && (
                  <div className="space-y-2 p-4 border rounded-lg">
                    <h3 className="font-semibold">Параметры транспорта</h3>
                    {transportParams.map(param => (
                      <div key={param.name} className="space-y-2">
                        <Label>{param.label}</Label>
                        {param.type === 'select' ? (
                          <Select
                            value={editingUser.transport_params[param.name] || param.default}
                            onChange={(e) => setEditingUser({
                              ...editingUser,
                              transport_params: { ...editingUser.transport_params, [param.name]: e.target.value }
                            })}
                          >
                            {param.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </Select>
                        ) : param.type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={editingUser.transport_params[param.name] || param.default}
                            onChange={(e) => setEditingUser({
                              ...editingUser,
                              transport_params: { ...editingUser.transport_params, [param.name]: e.target.checked }
                            })}
                            className="rounded"
                          />
                        ) : (
                          <Input
                            type="text"
                            value={editingUser.transport_params[param.name] || param.default}
                            onChange={(e) => setEditingUser({
                              ...editingUser,
                              transport_params: { ...editingUser.transport_params, [param.name]: e.target.value }
                            })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_mode">Mode</Label>
                    <Select
                      id="edit_mode"
                      value={editingUser.mode}
                      onChange={(e) => setEditingUser({ ...editingUser, mode: e.target.value })}
                    >
                      <option value="srv">srv (Server)</option>
                      <option value="cnc">cnc (SOCKS5 Proxy)</option>
                    </Select>
                  </div>

                  {editingUser.mode === 'cnc' && (
                    <div className="space-y-2">
                      <Label htmlFor="edit_socks_port">SOCKS5 Port</Label>
                      <Input
                        id="edit_socks_port"
                        type="number"
                        value={editingUser.socks_port}
                        onChange={(e) => setEditingUser({ ...editingUser, socks_port: parseInt(e.target.value) })}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_profile_name">Profile Name (опционально)</Label>
                  <Input
                    id="edit_profile_name"
                    value={editingUser.profile_name}
                    onChange={(e) => setEditingUser({ ...editingUser, profile_name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_dns">DNS сервер</Label>
                  <Input
                    id="edit_dns"
                    value={editingUser.dns}
                    onChange={(e) => setEditingUser({ ...editingUser, dns: e.target.value })}
                  />
                </div>

                {editingUser.mode === 'srv' && (
                  <div className="space-y-2 p-4 border rounded-lg">
                    <h3 className="font-semibold">Ограничение скорости (KB/s)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit_rx_limit">RX Limit (Download)</Label>
                        <Input
                          id="edit_rx_limit"
                          type="number"
                          placeholder="0 = без ограничений"
                          value={editingUser.rx_limit || 0}
                          onChange={(e) => setEditingUser({ ...editingUser, rx_limit: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit_tx_limit">TX Limit (Upload)</Label>
                        <Input
                          id="edit_tx_limit"
                          type="number"
                          placeholder="0 = без ограничений"
                          value={editingUser.tx_limit || 0}
                          onChange={(e) => setEditingUser({ ...editingUser, tx_limit: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit_debug"
                    checked={editingUser.debug}
                    onChange={(e) => setEditingUser({ ...editingUser, debug: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="edit_debug" className="cursor-pointer">Debug Mode</Label>
                </div>

                <Button onClick={updateUser} className="w-full">
                  Сохранить изменения
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Room ID Generator Dialog */}
      <Dialog open={showGenForm} onOpenChange={setShowGenForm}>
        <DialogContent onClose={() => setShowGenForm(false)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Генератор Room ID</DialogTitle>
            <DialogDescription>Генерирует Room ID заранее без запуска сервера</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="gen_carrier">Carrier</Label>
              <Select
                id="gen_carrier"
                value={genConfig.carrier}
                onChange={(e) => setGenConfig({ ...genConfig, carrier: e.target.value })}
              >
                <option value="wbstream">wbstream</option>
                <option value="jazz">jazz</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen_amount">Количество комнат</Label>
              <Input
                id="gen_amount"
                type="number"
                min="1"
                max="10"
                value={genConfig.amount}
                onChange={(e) => setGenConfig({ ...genConfig, amount: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen_dns">DNS сервер</Label>
              <Input
                id="gen_dns"
                value={genConfig.dns}
                onChange={(e) => setGenConfig({ ...genConfig, dns: e.target.value })}
              />
            </div>

            <Button onClick={generateRoomIds} disabled={isGenerating} className="w-full">
              {isGenerating ? 'Генерация...' : 'Сгенерировать'}
            </Button>

            {generatedRooms.length > 0 && (
              <div className="space-y-2 p-4 border rounded-lg">
                <h3 className="font-semibold">Сгенерированные Room ID:</h3>
                <div className="space-y-2">
                  {generatedRooms.map((roomId, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <span className="flex-1 font-mono text-sm truncate">{roomId}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(roomId, 'Room ID')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeRoomId(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent onClose={() => setShowQrDialog(false)} className="max-w-lg">
          {qrCodeData && (
            <>
              <DialogHeader>
                <DialogTitle>QR код инстанса #{qrCodeData.instanceId}</DialogTitle>
                <DialogDescription>
                  Отсканируйте QR код для подключения
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="flex justify-center p-4 bg-card border rounded-lg">
                  <img
                    src={qrCodeData.qrImage}
                    alt="QR Code"
                    className="w-full max-w-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label>URI</Label>
                  <div className="p-2 bg-muted rounded font-mono text-xs break-all">
                    {qrCodeData.uri}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => copyToClipboard(qrCodeData.uri, 'URI')}
                    variant="outline"
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Копировать URI
                  </Button>
                  <Button
                    onClick={downloadQrCode}
                    className="flex-1"
                  >
                    Скачать QR
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Subscription URLs Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent onClose={() => setShowSubscriptionDialog(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Subscription URLs</DialogTitle>
            <DialogDescription>
              Ссылки на subscription файлы для каждого Client ID
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {subscriptionUrls.map((item, index) => (
              <div key={index} className="space-y-2">
                <Label>Client ID: {item.clientId}</Label>
                <div className="flex gap-2">
                  <Input
                    value={item.url}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(item.url);
                      showNotification(`URL для ${item.clientId} скопирован`);
                    }}
                    variant="outline"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
