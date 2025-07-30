import { AlertCircle, Bell, CheckCircle, Clock, Edit, Globe, Pause, Play, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
// NUEVO: Importamos componentes para las gráficas
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import './website-monitor-dashboard.css';

// Type definitions for better code quality and safety
// NUEVO: Añadimos un historial a cada sitio web
interface CheckRecord {
  timestamp: string;
  status: 'online' | 'offline';
  responseTime: number;
}
interface Website {
  id: number;
  url: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  responseTime: number;
  lastCheck: string | null;
  uptime: number;
  category: string;
  isPaused: boolean;
  error?: string;
}

interface Alert {
  id: number;
  message: string;
  timestamp: string;
  type: 'success' | 'error';
}

// NUEVO: Paleta de colores para las gráficas
const chartColors = [
  { stroke: '#2563eb', fill: '#bfdbfe' }, // Blue
  { stroke: '#059669', fill: '#dcfce7' }, // Green
  { stroke: '#c026d3', fill: '#f5d0fe' }, // Fuchsia
  { stroke: '#ea580c', fill: '#ffedd5' }, // Orange
  { stroke: '#6d28d9', fill: '#ede9fe' }, // Violet
  { stroke: '#db2777', fill: '#fce7f3' }, // Pink
];

const defaultWebsites: Website[] = [
  { id: 1, url: 'https://intercertacademy.com/', name: 'INTERCERT ACADEMY', status: 'unknown', responseTime: 0, lastCheck: null, uptime: 100, category: 'INTERCERT', history: [], isPaused: false },
  { id: 2, url: 'https://www.intercert.com.pe/', name: 'INTERCERT.PE', status: 'unknown', responseTime: 0, lastCheck: null, uptime: 100, category: 'clientes', history: [], isPaused: false },
  { id: 3, url: 'https://cliente2.com', name: 'Cliente Demo 2', status: 'unknown', responseTime: 0, lastCheck: null, uptime: 100, category: 'clientes', history: [], isPaused: false }
];

const WebsiteMonitor = () => {
  const [websites, setWebsites] = useState<Website[]>(() => {
    const saved = localStorage.getItem('websites');
    return saved ? JSON.parse(saved) : defaultWebsites;
  });
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('INTERCERT');
  const [activeTab, setActiveTab] = useState('INTERCERT');
  const [isChecking, setIsChecking] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // NUEVO: Estado para manejar la edición
  const [editingWebsiteId, setEditingWebsiteId] = useState<number | null>(null);

  const [checkInterval, setCheckInterval] = useState(30); // segundos

  useEffect(() => {
    localStorage.setItem('websites', JSON.stringify(websites));
  }, [websites]);
  // Función para verificar el estado de una página
const checkWebsite = async (website: Website): Promise<Partial<Website>> => {
    try {
        const startTime = Date.now();
        // Usando un proxy CORS para evitar problemas de CORS en el navegador.
        // Nota: La fiabilidad de esta comprobación depende de la disponibilidad del proxy.
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(website.url)}`;
        const response = await fetch(proxyUrl);
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        if (!response.ok) {
            // Esto comprueba si el propio proxy está caído o ha devuelto un error.
            return {
                status: 'offline',
                responseTime: 0,
                lastCheck: new Date().toISOString(),
                error: `Error del proxy: ${response.statusText}`
            };
        }

        const data = await response.json();

        // Si el sitio de destino devuelve un código de éxito (2xx o 3xx)
        if (data.status && data.status.http_code >= 200 && data.status.http_code < 400) {
            const finalUrl = (data.status.url || '').toLowerCase();
            const pageContent = (data.contents || '').toLowerCase();

            // Verificación más robusta para páginas de suspensión por URL o contenido
            if (
                finalUrl.includes('suspendedpage.cgi') ||
                pageContent.includes('account suspended') ||
                pageContent.includes('this account has been suspended')
            ) {
                return {
                    status: 'offline',
                    responseTime: 0,
                    lastCheck: new Date().toISOString(),
                    error: 'Cuenta de hosting suspendida'
                };
            }

            return {
                status: 'online',
                responseTime: responseTime,
                lastCheck: new Date().toISOString(),
                error: undefined
            };
        } else {
            // El sitio de destino está caído o devolvió un código de error.
            return {
                status: 'offline',
                responseTime: 0,
                lastCheck: new Date().toISOString(),
                error: data.status.error || `Error HTTP ${data.status.http_code || 'desconocido'}`
            };
        }
    } catch (error: any) {
        // Esto captura errores de red (ej. el proxy no es accesible) o errores de parseo del JSON.
        return {
            status: 'offline',
            responseTime: 0,
            lastCheck: new Date().toISOString(),
            error: error.message || 'Error de red'
        };
    }
};


  // Función para verificar todos los sitios web
  const checkAllWebsites = useCallback(async () => {
    if (websites.length === 0) return;
    
    setIsChecking(true);
    const updatedWebsites: Website[] = [];
    
    for (const website of websites) {
      // NUEVO: Si el sitio está pausado, lo saltamos y mantenemos su estado actual.
      if (website.isPaused) {
        updatedWebsites.push(website);
        continue;
      }

      const result = await checkWebsite(website);
      // NUEVO: Creamos un registro del historial y lo guardamos
      const newHistoryRecord: CheckRecord = {
        timestamp: new Date().toISOString(),
        status: result.status || 'offline',
        responseTime: result.responseTime || 0,
      };
      const newHistory = [...(website.history || []), newHistoryRecord].slice(-50); // Guardar los últimos 50 registros

      const updatedWebsite: Website = {
        ...website,
        ...result,
        uptime: result.status === 'online' ? 
          Math.min(100, website.uptime + 0.1) : 
          Math.max(0, website.uptime - 5),
        history: newHistory,
      };
      
      // Generar alerta si el sitio se cayó
      if (website.status === 'online' && result.status === 'offline') {
        const alert: Alert = {
          id: Date.now(),
          message: `🚨 ${website.name} (${website.url}) está OFFLINE`,
          timestamp: new Date().toLocaleString(),
          type: 'error'
        };
        setAlerts(prev => [alert, ...prev.slice(0, 9)]);
        
        // Mostrar notificación del navegador si está permitido
        if (Notification.permission === 'granted') {
          new Notification(`Sitio Caído: ${website.name}`, {
            body: `${website.url} no está respondiendo. Causa: ${result.error}`,
            icon: '🚨'
          });
        }
      }
      
      // Alerta de recuperación
      if (website.status === 'offline' && result.status === 'online') {
        const alert: Alert = {
          id: Date.now(),
          message: `✅ ${website.name} (${website.url}) está de vuelta ONLINE`,
          timestamp: new Date().toLocaleString(),
          type: 'success'
        };
        setAlerts(prev => [alert, ...prev.slice(0, 9)]);
      }
      
      updatedWebsites.push(updatedWebsite);
    }
    
    setWebsites(updatedWebsites);
    setIsChecking(false);
  }, [websites]); // Quitamos la dependencia de 'alerts' para evitar ciclos

  // Solicitar permisos de notificación
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Configurar monitoreo automático
  useEffect(() => {
    const interval = setInterval(checkAllWebsites, checkInterval * 1000);
    return () => clearInterval(interval);
  }, [checkAllWebsites, checkInterval]);

  // Verificación inicial
  useEffect(() => {
    checkAllWebsites();
  }, []);

  const addWebsite = () => {
    if (newUrl && newName) {
      const newWebsite = {
        id: Date.now(),
        url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`,
        name: newName,
        status: 'unknown',
        responseTime: 0,
        lastCheck: null,
        uptime: 100,
        category: newCategory,
        history: [],
        isPaused: false,
      };
      setWebsites([...websites, newWebsite]);
      setNewUrl('');
      setNewName('');
    }
  };

  const removeWebsite = (id) => {
    setWebsites(websites.filter(w => w.id !== id));
  };

  // NUEVO: Función para guardar los cambios de un sitio editado
  const handleUpdateWebsite = (id: number, updatedData: Partial<Website>) => {
    setWebsites(websites.map(w => w.id === id ? { ...w, ...updatedData } : w));
    setEditingWebsiteId(null); // Salir del modo edición
  };

  // NUEVO: Función para entrar en modo edición
  const handleEditWebsite = (website: Website) => {
    setEditingWebsiteId(website.id);
  };

  // NUEVO: Función para pausar o reanudar el monitoreo de un sitio
  const togglePauseWebsite = (id: number) => {
    setWebsites(websites.map(w => {
      if (w.id === id) {
        const isNowPaused = !w.isPaused;
        // Si se reanuda, se marca como 'unknown' para forzar una nueva verificación visual.
        return { ...w, isPaused: isNowPaused, status: isNowPaused ? w.status : 'unknown' };
      }
      return w;
    }));
  };

  const getStatusColor = (status, isPaused) => {
    if (isPaused) return 'text-gray-500 bg-gray-200';
    switch (status) {
      case 'online': return 'text-green-600 bg-green-100';
      case 'offline': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };
  const getStatusIcon = (status, isPaused) => {
    if (isPaused) return <Pause className="w-5 h-5" />;
    switch (status) {
      case 'online': return <CheckCircle className="w-5 h-5" />;
      case 'offline': return <AlertCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  // Filtrar sitios web por categoría
  const filteredWebsites = websites.filter(website => website.category === activeTab);
  
  // Estadísticas por categoría
  const getStatsForCategory = (category) => {
    const categoryWebsites = websites.filter(w => w.category === category);
    return {
      total: categoryWebsites.length,
      online: categoryWebsites.filter(w => w.status === 'online').length,
      offline: categoryWebsites.filter(w => w.status === 'offline').length,
      avgUptime: categoryWebsites.length > 0 ? 
        Math.round(categoryWebsites.reduce((acc, w) => acc + w.uptime, 0) / categoryWebsites.length) : 0
    };
  };

  const currentStats = getStatsForCategory(activeTab);


  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Monitor de Web</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Intervalo:</label>
                <select 
                  value={checkInterval} 
                  onChange={(e) => setCheckInterval(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                </select>
              </div>
              <button
                onClick={checkAllWebsites}
                disabled={isChecking}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? 'Verificando...' : 'Verificar Ahora'}
              </button>
            </div>
          </div>

          {/* Estadísticas generales */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-green-800 text-sm font-medium">Online</div>
              <div className="text-2xl font-bold text-green-900">
                {currentStats.online}
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-red-800 text-sm font-medium">Offline</div>
              <div className="text-2xl font-bold text-red-900">
                {currentStats.offline}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-gray-800 text-sm font-medium">Total</div>
              <div className="text-2xl font-bold text-gray-900">{currentStats.total}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-blue-800 text-sm font-medium">Uptime Promedio</div>
              <div className="text-2xl font-bold text-blue-900">
                {currentStats.avgUptime}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de sitios web */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Sitios Web Monitoreados</h2>
                </div>
                
                {/* Pestañas */}
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('INTERCERT')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'INTERCERT'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                     INTERCERT ({getStatsForCategory('INTERCERT').total})
                  </button>
                  <button
                    onClick={() => setActiveTab('clientes')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'clientes'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                     CLIENTES ({getStatsForCategory('clientes').total})
                  </button>
                </div>
              </div>
              
              {/* Formulario para agregar nuevo sitio */}
              <div className="p-6 border-b bg-gray-50">
                <div className="flex gap-3">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="INTERCERT"> INTERCERT</option>
                    <option value="clientes"> CLIENTES</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Nombre del sitio"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="URL (ej: https://ejemplo.com)"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="flex-2 border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <button
                    onClick={addWebsite}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar
                  </button>
                </div>
              </div>

              {/* Lista de sitios */}
              <div className="space-y-4 p-6">
                {filteredWebsites.map((website, index) => {
                  const color = chartColors[index % chartColors.length];
                  const chartData = website.history.map(h => ({
                    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    'ms': h.responseTime > 0 ? h.responseTime : null, // No mostrar 0 en la gráfica
                  }));

                  // NUEVO: Renderizado condicional para el modo de edición
                  if (editingWebsiteId === website.id) {
                    return <EditWebsiteForm 
                              key={website.id} 
                              website={website} 
                              onSave={handleUpdateWebsite} 
                              onCancel={() => setEditingWebsiteId(null)} 
                           />;
                  }

                  return (
                    <div key={website.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${getStatusColor(website.status, website.isPaused)}`}>
                            {getStatusIcon(website.status, website.isPaused)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{website.name}</div>
                            <div className="text-sm text-gray-600">{website.url}</div>
                            {website.lastCheck && (
                              <div className="text-xs text-gray-500">
                                Último check: {new Date(website.lastCheck).toLocaleString()}
                              </div>
                            )}
                            {website.isPaused && (
                              <div className="text-xs text-yellow-700 font-medium mt-1">
                                Monitoreo pausado
                              </div>
                            )}
                            {website.status === 'offline' && website.error && (
                              <div className="text-xs text-red-600 mt-1" title={website.error}>
                                Error: {website.error.substring(0, 30)}{website.error.length > 30 ? '...' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">
                              Uptime: {Math.round(website.uptime)}%
                            </div>
                            {website.responseTime > 0 && (
                              <div className="text-xs text-gray-600">
                                {website.responseTime}ms
                              </div>
                            )}
                          </div>
                          {/* NUEVO: Botones de Editar y Borrar */}
                          <div className="flex flex-col">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEditWebsite(website); }}
                              className="text-gray-400 hover:text-blue-600 p-1"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePauseWebsite(website.id); }}
                              className="text-gray-400 hover:text-yellow-600 p-1"
                            >
                              {website.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeWebsite(website.id); }}
                              className="text-gray-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Gráfica integrada */}
                      {website.history && website.history.length > 1 && (
                        <div className="bg-gray-50" style={{ height: '120px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                              <Tooltip contentStyle={{ fontSize: '12px', padding: '4px 8px', borderRadius: '0.5rem' }} />
                              <YAxis hide={true} domain={['dataMin - 100', 'dataMax + 100']} />
                              <Area type="monotone" dataKey="ms" stroke={color.stroke} fill={color.fill} strokeWidth={2} connectNulls />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {filteredWebsites.length === 0 && (
                  <div className="p-12 text-center text-gray-500">
                    {activeTab === 'INTERCERT' 
                      ? 'No hay sitios de INTERCERT configurados. Agrega uno arriba para comenzar.'
                      : 'No hay sitios de clientes configurados. Agrega uno arriba para comenzar.'
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel de alertas */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-orange-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Alertas Recientes</h2>
                </div>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No hay alertas recientes
                  </div>
                ) : (
                  <div className="divide-y">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="p-4">
                        <div className={`text-sm ${alert.type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
                          {alert.message}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {alert.timestamp}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Información adicional */}
            <div className="bg-blue-50 rounded-lg p-4 mt-6">
              <h3 className="font-semibold text-blue-900 mb-2">💡 Consejos:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Haz clic en el ✏️ para editar un sitio existente.</li>
                <li>• Las notificaciones del navegador te alertarán cuando un sitio se caiga</li>
                <li>• El uptime se calcula basado en las verificaciones exitosas</li>
                <li>• Ajusta el intervalo según tus necesidades de monitoreo</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// NUEVO: Componente para el formulario de edición
const EditWebsiteForm = ({ website, onSave, onCancel }: { website: Website, onSave: (id: number, data: Partial<Website>) => void, onCancel: () => void }) => {
  const [name, setName] = useState(website.name);
  const [url, setUrl] = useState(website.url);
  const [category, setCategory] = useState(website.category);

  const handleSave = () => {
    onSave(website.id, { name, url, category });
  };

  return (
    <div className="bg-white border-2 border-blue-500 rounded-lg shadow-lg p-4 space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        placeholder="Nombre del sitio"
      />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        placeholder="URL del sitio"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      >
        <option value="INTERCERT">INTERCERT</option>
        <option value="clientes">CLIENTES</option>
      </select>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 px-3 py-1 rounded-lg">
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button onClick={handleSave} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
          <Save className="w-4 h-4" /> Guardar
        </button>
      </div>
    </div>
  );
};

export default WebsiteMonitor;