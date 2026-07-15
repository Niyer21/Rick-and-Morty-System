// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const API_URL = 'https://rickandmortyapi.com/api';

let currentUser = localStorage.getItem('currentUser') || null;
let activeTab = 'dashboard';

// Estado de Personajes
let charPage = 1;
let charTotalPages = 1;
let searchTerm = '';
let filterStatus = '';
let filterGender = '';
let charSortCol = 'id';
let charSortDir = 'asc';

// Estado de Episodios
let episodePage = 1;
let episodeTotalPages = 1;
let searchEpTerm = '';
let epSortCol = 'id';
let epSortDir = 'asc';

// Listas Locales (CRUD y Persistencia)
let customCharacters = JSON.parse(localStorage.getItem('customCharacters')) || [];
let editedCharacters = JSON.parse(localStorage.getItem('editedCharacters')) || [];
let deletedCharacterIds = JSON.parse(localStorage.getItem('deletedCharacterIds')) || [];
let editedEpisodes = JSON.parse(localStorage.getItem('editedEpisodes')) || [];

// ==========================================
// CACHÉ OFFLINE (Web Storage API)
// ==========================================
const CACHE_PREFIX = 'api_cache_';
const CACHE_MAX_ENTRIES = 40;
const CACHE_EVICT_COUNT = 10;

/**
 * Guarda una respuesta JSON en localStorage con un timestamp.
 */
function setApiCache(url, data) {
    try {
        limpiarCacheAntigua();
        const entry = { data, timestamp: Date.now() };
        localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(entry));
    } catch (e) {
        // Si localStorage está lleno (cuota excedida), limpiar y reintentar una vez
        console.warn('localStorage lleno, limpiando caché...', e);
        limpiarCacheAntigua(true);
        try {
            localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (e2) {
            console.error('No se pudo guardar en caché:', e2);
        }
    }
}

/**
 * Recupera una respuesta JSON del caché de localStorage.
 * Devuelve el objeto de datos o null si no existe.
 */
function getApiCache(url) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + url);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        return entry.data || null;
    } catch (e) {
        return null;
    }
}

/**
 * Elimina las entradas de caché más antiguas si se supera el límite.
 * @param {boolean} force - Si es true, elimina agresivamente la mitad del caché.
 */
function limpiarCacheAntigua(force = false) {
    const cacheKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            try {
                const entry = JSON.parse(localStorage.getItem(key));
                cacheKeys.push({ key, timestamp: entry.timestamp || 0 });
            } catch (e) {
                cacheKeys.push({ key, timestamp: 0 });
            }
        }
    }

    const limit = force ? Math.floor(cacheKeys.length / 2) : CACHE_MAX_ENTRIES;
    const evict = force ? Math.ceil(cacheKeys.length / 2) : CACHE_EVICT_COUNT;

    if (cacheKeys.length >= limit) {
        // Ordenar por timestamp ascendente (los más viejos primero) y eliminar
        cacheKeys.sort((a, b) => a.timestamp - b.timestamp);
        cacheKeys.slice(0, evict).forEach(entry => localStorage.removeItem(entry.key));
    }
}

/**
 * Realiza una petición fetch con caché transparente usando localStorage.
 * - Si hay red: descarga, guarda en caché y devuelve un objeto Response-like.
 * - Si no hay red: intenta devolver datos desde caché con un indicador offline.
 */
async function fetchWithCache(url) {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            setApiCache(url, data);
            // Devolver un objeto compatible con la interfaz Response
            return {
                ok: true,
                offline: false,
                json: () => Promise.resolve(data)
            };
        }
        // Respuesta del servidor no exitosa, intentar caché
        throw new Error(`HTTP ${response.status}`);
    } catch (networkError) {
        // Sin conexión o error de red: intentar caché
        const cached = getApiCache(url);
        if (cached !== null) {
            return {
                ok: true,
                offline: true,
                json: () => Promise.resolve(cached)
            };
        }
        // Sin caché disponible: propagar el error original
        throw networkError;
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    checkAuthSession();
});


// ==========================================
// MODO OSCURO / CLARO
// ==========================================
function initTheme() {
    const btnTheme = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');

    const setDark = () => {
        document.body.classList.add('dark-mode');
        if (btnTheme) btnTheme.textContent = 'Modo Claro';
        localStorage.setItem('theme', 'dark');
    };

    const setLight = () => {
        document.body.classList.remove('dark-mode');
        if (btnTheme) btnTheme.textContent = 'Modo Oscuro';
        localStorage.setItem('theme', 'light');
    };

    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            if (document.body.classList.contains('dark-mode')) {
                setLight();
            } else {
                setDark();
            }
        });
    }

    if (savedTheme === 'light') {
        setLight();
    } else {
        setDark(); // Oscuro por defecto
    }
}

// ==========================================
// EVENTOS
// ==========================================
function setupEventListeners() {
    // Detectores de conexión (Resiliencia)
    window.addEventListener('offline', () => {
        showToast("Conexión perdida. Activando modo offline (Caché local)", "error");
    });
    
    window.addEventListener('online', () => {
        showToast("Conexión restablecida. Sincronización activa", "success");
    });

    // Botones de Cabecera y Navegación
    document.getElementById('btn-show-login')?.addEventListener('click', () => mostrarFormularioAuth('login-container'));
    document.getElementById('btn-show-register')?.addEventListener('click', () => mostrarFormularioAuth('register-container'));
    document.getElementById('btn-recuperar')?.addEventListener('click', () => mostrarFormularioAuth('recuperar-container'));
    document.getElementById('btn-back-login')?.addEventListener('click', () => mostrarFormularioAuth('login-container'));
    document.getElementById('btn-cancel-recover')?.addEventListener('click', () => mostrarFormularioAuth('login-container'));
    
    // Formularios de Autenticación
    document.getElementById('register-form')?.addEventListener('submit', registrarUsuario);
    document.getElementById('login-form')?.addEventListener('submit', iniciarSesion);
    document.getElementById('recover-form')?.addEventListener('submit', recuperarContrasena);
    
    // Navegación de Pestañas
    document.getElementById('nav-dashboard')?.addEventListener('click', () => showTab('dashboard'));
    document.getElementById('nav-personajes')?.addEventListener('click', () => showTab('personajes'));
    document.getElementById('nav-episodios')?.addEventListener('click', () => showTab('episodios'));
    document.getElementById('nav-logout')?.addEventListener('click', cerrarSesion);

    // CRUD Personajes - Buscar, Filtrar y Ordenar
    const searchInput = document.getElementById('search-personajes');
    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            searchTerm = e.target.value;
            debounceTimer = setTimeout(() => {
                charPage = 1;
                cargarPersonajes();
            }, 400);
        });
    }

    document.getElementById('filter-status')?.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        charPage = 1;
        cargarPersonajes();
    });

    document.getElementById('filter-gender')?.addEventListener('change', (e) => {
        filterGender = e.target.value;
        charPage = 1;
        cargarPersonajes();
    });

    // Ordenamiento por encabezados de tabla de personajes
    document.querySelectorAll('#tabla-personajes th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (charSortCol === col) {
                charSortDir = charSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                charSortCol = col;
                charSortDir = 'asc';
            }
            actualizarIconosOrdenamientoChar();
            cargarPersonajes();
        });
    });

    // CRUD Episodios - Buscar y Ordenar
    const searchEpInput = document.getElementById('search-episodios');
    let debounceEpTimer;
    if (searchEpInput) {
        searchEpInput.addEventListener('input', (e) => {
            clearTimeout(debounceEpTimer);
            searchEpTerm = e.target.value;
            debounceEpTimer = setTimeout(() => {
                episodePage = 1;
                cargarEpisodios();
            }, 400);
        });
    }

    // Ordenamiento por encabezados de tabla de episodios
    document.querySelectorAll('#tabla-episodios th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (epSortCol === col) {
                epSortDir = epSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                epSortCol = col;
                epSortDir = 'asc';
            }
            actualizarIconosOrdenamientoEp();
            cargarEpisodios();
        });
    });

    // CRUD Personajes - Modales y Formularios
    document.getElementById('btn-abrir-crear')?.addEventListener('click', abrirModalCrear);
    document.getElementById('btn-cerrar-crear')?.addEventListener('click', () => cerrarModal('modal-crear-personaje'));
    document.getElementById('btn-cancelar-crear')?.addEventListener('click', () => cerrarModal('modal-crear-personaje'));
    document.getElementById('form-crear-personaje')?.addEventListener('submit', crearPersonaje);

    document.getElementById('btn-cerrar-editar')?.addEventListener('click', () => cerrarModal('edicion-personaje'));
    document.getElementById('btn-cancelar-editar-personaje')?.addEventListener('click', () => cerrarModal('edicion-personaje'));
    document.getElementById('form-editar-personaje')?.addEventListener('submit', guardarEdicionPersonaje);

    document.getElementById('btn-cerrar-detalle')?.addEventListener('click', () => cerrarModal('detalle-personaje'));
    document.getElementById('btn-cerrar-detalle-footer')?.addEventListener('click', () => cerrarModal('detalle-personaje'));

    // CRUD Episodios - Modales y Formularios
    document.getElementById('btn-cerrar-editar-ep')?.addEventListener('click', () => cerrarModal('modal-editar-episodio'));
    document.getElementById('btn-cancelar-editar-ep')?.addEventListener('click', () => cerrarModal('modal-editar-episodio'));
    document.getElementById('form-editar-episodio')?.addEventListener('submit', guardarEdicionEpisodio);

    // Paginación
    document.getElementById('btn-prev-chars')?.addEventListener('click', () => cambiarPaginaChar(-1));
    document.getElementById('btn-next-chars')?.addEventListener('click', () => cambiarPaginaChar(1));
    document.getElementById('btn-prev-episodes')?.addEventListener('click', () => cambiarPaginaEpisodio(-1));
    document.getElementById('btn-next-episodes')?.addEventListener('click', () => cambiarPaginaEpisodio(1));
}

// ==========================================
// SESIÓN DE AUTENTICACIÓN
// ==========================================
function checkAuthSession() {
    const btnShowLogin = document.getElementById('btn-show-login');
    const btnShowRegister = document.getElementById('btn-show-register');
    const btnLogout = document.getElementById('nav-logout');
    
    if (currentUser) {
        // --- USUARIO AUTENTICADO ---
        if(btnShowLogin) btnShowLogin.hidden = true;
        if(btnShowRegister) btnShowRegister.hidden = true;
        if(btnLogout) btnLogout.hidden = false;
        
        const pantallaBienvenida = document.getElementById('pantalla-bienvenida');
        const authContainer = document.getElementById('autenticacion');
        const menuPrincipal = document.getElementById('menu-principal');
        
        if(pantallaBienvenida) pantallaBienvenida.hidden = true;
        if(authContainer) authContainer.hidden = true;
        if(menuPrincipal) menuPrincipal.hidden = false;
        
        const userObj = JSON.parse(localStorage.getItem(`user_${currentUser}`));
        const userName = userObj ? userObj.name : currentUser.split('@')[0];
        const appTitle = document.getElementById('app-title');
        if(appTitle) appTitle.textContent = `Portal de ${userName}`;
        
        showTab('dashboard');
    } else {
        // --- USUARIO INVITADO (SIN SESIÓN) ---
        if(btnShowLogin) btnShowLogin.hidden = false;
        if(btnShowRegister) btnShowRegister.hidden = false;
        if(btnLogout) btnLogout.hidden = true;
        
        const appTitle = document.getElementById('app-title');
        if(appTitle) appTitle.textContent = 'Rick & Morty System';
        
        const pantallaBienvenida = document.getElementById('pantalla-bienvenida');
        const authContainer = document.getElementById('autenticacion');
        const menuPrincipal = document.getElementById('menu-principal');
        
        if(pantallaBienvenida) pantallaBienvenida.hidden = false; // Muestra solo la bienvenida
        if(authContainer) authContainer.hidden = true;
        if(menuPrincipal) menuPrincipal.hidden = true; // Oculta el menú
        
        // ¡IMPORTANTE! Ocultar forzosamente todas las vistas privadas
        const vistaDashboard = document.getElementById('vista-dashboard');
        const vistaPersonajes = document.getElementById('vista-personajes');
        const vistaEpisodios = document.getElementById('vista-episodios');
        
        if(vistaDashboard) vistaDashboard.hidden = true;
        if(vistaPersonajes) vistaPersonajes.hidden = true;
        if(vistaEpisodios) vistaEpisodios.hidden = true;
    }
}

function mostrarFormularioAuth(contenedorVisible) {
    document.getElementById('pantalla-bienvenida').hidden = true;
    document.getElementById('autenticacion').hidden = false;
    
    // Asegurarnos de que nada privado se muestre
    if(document.getElementById('menu-principal')) document.getElementById('menu-principal').hidden = true;
    if(document.getElementById('vista-dashboard')) document.getElementById('vista-dashboard').hidden = true;
    if(document.getElementById('vista-personajes')) document.getElementById('vista-personajes').hidden = true;
    if(document.getElementById('vista-episodios')) document.getElementById('vista-episodios').hidden = true;
    
    document.getElementById('login-container').hidden = (contenedorVisible !== 'login-container');
    document.getElementById('register-container').hidden = (contenedorVisible !== 'register-container');
    document.getElementById('recuperar-container').hidden = (contenedorVisible !== 'recuperar-container');
}

function registrarUsuario(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;

    if (localStorage.getItem(`user_${email}`)) {
        showToast("Este correo ya está registrado en el multiverso", "error");
        return;
    }

    localStorage.setItem(`user_${email}`, JSON.stringify({ name, email, pass }));
    showToast("¡Cuenta creada! Viaja de regreso para iniciar sesión", "success");
    document.getElementById('register-form').reset();
    mostrarFormularioAuth('login-container');
}

function iniciarSesion(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const user = JSON.parse(localStorage.getItem(`user_${email}`));

    if (user && user.pass === pass) {
        currentUser = email;
        localStorage.setItem('currentUser', email);
        showToast(`¡Acceso concedido, camarada!`, "success");
        document.getElementById('login-form').reset();
        checkAuthSession();
    } else {
        showToast("Credenciales incorrectas o dimensión desconocida", "error");
    }
}

function recuperarContrasena(e) {
    e.preventDefault();
    const email = document.getElementById('recover-email').value.trim();
    showToast(`Se han enviado instrucciones de recuperación a ${email}`, "info");
    document.getElementById('recover-form').reset();
    mostrarFormularioAuth('login-container');
}

function cerrarSesion() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showToast("Portal de sesión cerrado", "info");
    checkAuthSession();
}

// ==========================================
// NOTIFICACIONES TOAST
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-content">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================
// NAVEGACIÓN
// ==========================================
function showTab(tabName) {
    if (!currentUser) {
        checkAuthSession();
        return;
    }
    activeTab = tabName;
    
    document.querySelectorAll('.nav-tabs button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(`nav-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const vistaDashboard = document.getElementById('vista-dashboard');
    const vistaPersonajes = document.getElementById('vista-personajes');
    const vistaEpisodios = document.getElementById('vista-episodios');

    if(vistaDashboard) vistaDashboard.hidden = (tabName !== 'dashboard');
    if(vistaPersonajes) vistaPersonajes.hidden = (tabName !== 'personajes');
    if(vistaEpisodios) vistaEpisodios.hidden = (tabName !== 'episodios');

    if (tabName === 'dashboard') {
        cargarDashboardStats();
    } else if (tabName === 'personajes') {
        cargarPersonajes();
    } else if (tabName === 'episodios') {
        cargarEpisodios();
    }
}

// ==========================================
// DASHBOARD
// ==========================================
async function cargarDashboardStats() {
    if (!currentUser) return;
    try {
        const [charRes, aliveRes, epRes] = await Promise.all([
            fetchWithCache(`${API_URL}/character`),
            fetchWithCache(`${API_URL}/character?status=alive`),
            fetchWithCache(`${API_URL}/episode`)
        ]);

        // Detectar si alguna respuesta viene del caché offline
        const isOffline = charRes.offline || aliveRes.offline || epRes.offline;

        const charData = await charRes.json();
        const aliveData = await aliveRes.json();
        const epData = await epRes.json();

        const totalApiChars = charData.info ? charData.info.count : 0;
        const totalApiAlive = aliveData.info ? aliveData.info.count : 0;
        const totalApiEpisodes = epData.info ? epData.info.count : 0;

        const customCount = customCharacters.length;
        const customAliveCount = customCharacters.filter(c => c.status === 'Alive').length;
        const deletedApiCount = deletedCharacterIds.length;

        const netChars = totalApiChars + customCount - deletedApiCount;
        const netAlive = totalApiAlive + customAliveCount;

        const statTotal = document.getElementById('stat-total-chars');
        const statAlive = document.getElementById('stat-alive-chars');
        const statEp = document.getElementById('stat-total-episodes');

        if(statTotal) statTotal.textContent = netChars;
        if(statAlive) statAlive.textContent = netAlive;
        if(statEp) statEp.textContent = totalApiEpisodes;

        if (isOffline) showToast('📦 Estadísticas cargadas desde caché offline', 'info');

        cargarPersonajeDestacado(totalApiChars);
    } catch (error) {
        console.error("Error al cargar estadísticas:", error);
        showToast('Sin conexión y sin caché disponible para el Dashboard', 'error');
    }
}

async function cargarPersonajeDestacado(maxId) {
    const container = document.getElementById('featured-character-container');
    if (!container) return;

    const randomId = Math.floor(Math.random() * maxId) + 1;

    try {
        const res = await fetchWithCache(`${API_URL}/character/${randomId}`);
        const char = await res.json();

        const edited = editedCharacters.find(c => c.id === char.id);
        const displayedChar = edited ? { ...char, ...edited } : char;

        if (deletedCharacterIds.includes(displayedChar.id)) {
            cargarPersonajeDestacado(maxId);
            return;
        }

        container.innerHTML = `
            <div style="background: var(--color-tarjeta); border: 1px solid var(--color-borde-glow); border-radius: var(--radio-borde); padding: 25px; box-shadow: 0 0 15px var(--color-sombra-neon);">
                <h3 style="font-family: var(--fuente-titulo); color: var(--color-secundario); margin-bottom: 15px;">🌟 Personaje Destacado</h3>
                <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                    <img src="${displayedChar.image}" alt="${displayedChar.name}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-acento);">
                    <div>
                        <h4 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 5px;">${displayedChar.name}</h4>
                        <p style="font-size: 0.9rem; opacity: 0.8;">Especie: <strong>${displayedChar.species}</strong></p>
                        <p style="font-size: 0.9rem; opacity: 0.8;">Género: <strong>${displayedChar.gender}</strong></p>
                        <p style="font-size: 0.9rem; opacity: 0.8;">Ubicación: <strong>${displayedChar.location ? (displayedChar.location.name || displayedChar.location) : 'Desconocida'}</strong></p>
                        <button onclick="verDetallePersonaje(${displayedChar.id})" class="btn-gris" style="margin-top: 10px; padding: 6px 12px; font-size: 0.75rem;">Ver Detalles</button>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Error al obtener personaje destacado:", e);
    }
}

// ==========================================
// GESTIÓN DE PERSONAJES (CRUD Y ORDENAMIENTO)
// ==========================================
async function cargarPersonajes() {
    if (!currentUser) return;
    const tbody = document.getElementById('personajes-tbody');
    const loading = document.getElementById('loading-personajes');
    const paginador = document.getElementById('paginacion-personajes');

    if(!tbody || !loading || !paginador) return;

    tbody.innerHTML = '';
    loading.hidden = false;
    paginador.style.display = 'none';

    try {
        let url = `${API_URL}/character/?page=${charPage}`;
        if (searchTerm) url += `&name=${encodeURIComponent(searchTerm)}`;
        if (filterStatus) url += `&status=${encodeURIComponent(filterStatus)}`;
        if (filterGender) url += `&gender=${encodeURIComponent(filterGender)}`;

        const res = await fetchWithCache(url);
        const data = res.ok ? await res.json() : { results: [], info: { pages: 1 } };
        if (res.offline) showToast('📦 Personajes cargados desde caché offline', 'info');
        
        charTotalPages = data.info ? data.info.pages : 1;

        let processedApiChars = (data.results || []).filter(c => !deletedCharacterIds.includes(c.id));
        processedApiChars = processedApiChars.map(c => {
            const edit = editedCharacters.find(ec => ec.id === c.id);
            return edit ? { ...c, ...edit } : c;
        });

        let localMatchingChars = [];
        if (charPage === 1) {
            localMatchingChars = customCharacters.filter(c => {
                const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesStatus = filterStatus ? c.status.toLowerCase() === filterStatus.toLowerCase() : true;
                const matchesGender = filterGender ? c.gender.toLowerCase() === filterGender.toLowerCase() : true;
                return matchesSearch && matchesStatus && matchesGender;
            });
        }

        let finalCharacters = [...localMatchingChars, ...processedApiChars];

        // LÓGICA DE ORDENAMIENTO POR CUALQUIER COLUMNA
        finalCharacters.sort((a, b) => {
            let valA, valB;
            if (charSortCol === 'id') {
                const idA = parseInt(String(a.id).replace('custom_', '')) || 0;
                const idB = parseInt(String(b.id).replace('custom_', '')) || 0;
                return charSortDir === 'asc' ? idA - idB : idB - idA;
            }
            valA = String(a[charSortCol] || '').toLowerCase();
            valB = String(b[charSortCol] || '').toLowerCase();
            return charSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        loading.hidden = true;
        actualizarIconosOrdenamientoChar();

        if (finalCharacters.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; border: 1px dashed var(--color-borde); border-radius: var(--radio-borde);">
                        No se encontraron personajes en esta sección del multiverso.
                    </td>
                </tr>
            `;
            return;
        }

        finalCharacters.forEach(char => {
            const tr = document.createElement('tr');
            tr.dataset.id = char.id;

            const charType = char.type || 'Ninguno';
            const charImage = char.image || 'https://rickandmortyapi.com/api/character/avatar/19.jpeg';

            tr.innerHTML = `
                <td>${char.id}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${charImage}" alt="${char.name}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--color-secundario);">
                        <strong>${char.name}</strong>
                    </div>
                </td>
                <td>${char.species || 'Desconocida'}</td>
                <td>${char.gender || 'Desconocido'}</td>
                <td>${charType}</td>
                <td>
                    <button onclick="verDetallePersonaje('${char.id}')" class="btn-gris">Detalles</button>
                    <button onclick="abrirModalEditar('${char.id}')" class="btn-exito">Editar</button>
                    <button onclick="confirmarEliminarPersonaje('${char.id}', '${char.name.replace(/'/g, "\\'")}')" class="btn-peligro">Borrar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        paginador.style.display = 'flex';
        const infoPageChars = document.getElementById('info-page-chars');
        const btnPrevChars = document.getElementById('btn-prev-chars');
        const btnNextChars = document.getElementById('btn-next-chars');
        
        if(infoPageChars) infoPageChars.textContent = `Página ${charPage} de ${charTotalPages}`;
        if(btnPrevChars) btnPrevChars.disabled = (charPage <= 1);
        if(btnNextChars) btnNextChars.disabled = (charPage >= charTotalPages);

    } catch (error) {
        console.error("Error al cargar personajes:", error);
        loading.hidden = true;
        showToast('Sin conexión y sin caché para esta página de personajes', 'error');
    }
}

function cambiarPaginaChar(amount) {
    charPage += amount;
    if (charPage < 1) charPage = 1;
    if (charPage > charTotalPages) charPage = charTotalPages;
    cargarPersonajes();
    const vista = document.getElementById('vista-personajes');
    if(vista) vista.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// MODAL: DETALLES PERSONAJE
// ==========================================
async function verDetallePersonaje(id) {
    const dialog = document.getElementById('detalle-personaje');
    const body = document.getElementById('detail-body');
    if(!dialog || !body) return;

    const title = document.getElementById('detail-title');
    if (title) title.textContent = 'Detalles del Personaje';

    body.innerHTML = '<div class="loading-container"><div class="portal-spinner"></div><div class="loading-text">Cargando detalles...</div></div>';
    dialog.showModal();

    try {
        let char;
        const isCustom = isNaN(id) || id.toString().startsWith('custom_');

        if (isCustom) {
            char = customCharacters.find(c => c.id.toString() === id.toString());
        } else {
            const res = await fetchWithCache(`${API_URL}/character/${id}`);
            char = await res.json();
            const edit = editedCharacters.find(ec => ec.id === char.id);
            if (edit) char = { ...char, ...edit };
        }

        if (!char) {
            body.innerHTML = '<p>Error: Personaje no localizado.</p>';
            return;
        }

        const statusClass = char.status ? char.status.toLowerCase() : 'unknown';
        const statusLabel = char.status === 'Alive' ? 'Vivo' : (char.status === 'Dead' ? 'Muerto' : 'Desconocido');
        const charImage = char.image || 'https://rickandmortyapi.com/api/character/avatar/19.jpeg';
        
        let episodeListHtml = '<li>Ningún episodio registrado en el multiverso</li>';
        
        if (char.episode && char.episode.length > 0) {
            episodeListHtml = '<li>Cargando episodios del multiverso...</li>';
            body.innerHTML = renderDetailContent(char, charImage, statusClass, statusLabel, episodeListHtml);
            
            const epUrls = char.episode.slice(0, 8); // Mostrar maximo 8
            try {
                const epData = await Promise.all(
                    epUrls.map(url => fetchWithCache(url).then(r => r.json()))
                );
                episodeListHtml = epData.map(ep => `<li>${ep.episode} - <strong>${ep.name}</strong> (${ep.air_date})</li>`).join('');
            } catch (e) {
                console.error("Error al cargar episodios en detalle:", e);
                episodeListHtml = '<li>Error al cargar la lista de episodios.</li>';
            }
        }

        body.innerHTML = renderDetailContent(char, charImage, statusClass, statusLabel, episodeListHtml);

    } catch (error) {
        console.error("Error al mostrar detalle:", error);
        body.innerHTML = '<p>Error al obtener los detalles del personaje.</p>';
    }
}

function renderDetailContent(char, charImage, statusClass, statusLabel, episodeListHtml) {
    return `
        <div class="detail-avatar-container">
            <img src="${charImage}" alt="${char.name}" class="detail-avatar">
        </div>
        <div style="text-align: center; margin-bottom: 10px;">
            <h4 style="font-family: var(--fuente-titulo); font-size: 1.5rem; font-weight: 800;">${char.name}</h4>
            <span class="status-badge" style="position: static; display: inline-flex; margin-top: 8px;">
                <span class="status-dot ${statusClass}"></span> ${statusLabel}
            </span>
        </div>
        <div class="detail-grid">
            <div class="detail-item">
                <span class="detail-label">Especie</span>
                <span class="detail-value">${char.species || 'Desconocida'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Género</span>
                <span class="detail-value">${char.gender || 'Desconocido'}</span>
            </div>
            <div class="detail-item" style="grid-column: 1 / -1;">
                <span class="detail-label">Origen</span>
                <span class="detail-value">${char.origin ? (char.origin.name || char.origin) : 'Desconocido'}</span>
            </div>
            <div class="detail-item" style="grid-column: 1 / -1;">
                <span class="detail-label">Ubicación actual</span>
                <span class="detail-value">${char.location ? (char.location.name || char.location) : 'Desconocida'}</span>
            </div>
        </div>
        <div class="detail-episodes-list">
            <h5 style="font-family: var(--fuente-titulo); font-weight: 700; margin-bottom: 5px;">Apariciones (Máx. 8)</h5>
            <ul>${episodeListHtml}</ul>
        </div>
    `;
}

// ==========================================
// CRUD: CREAR Y EDITAR PERSONAJE
// ==========================================
function abrirModalCrear() {
    const form = document.getElementById('form-crear-personaje');
    if(form) form.reset();
    document.getElementById('modal-crear-personaje')?.showModal();
}

function crearPersonaje(e) {
    e.preventDefault();
    const name = document.getElementById('create-name').value.trim();
    const status = document.getElementById('create-status').value;
    const species = document.getElementById('create-species').value.trim();
    const gender = document.getElementById('create-gender').value;
    const location = document.getElementById('create-location').value.trim() || 'Desconocida';
    const avatar = document.getElementById('create-avatar').value.trim();

    const newChar = {
        id: `custom_${Date.now()}`,
        name, status, species, gender,
        origin: 'Dimensión Local (Creado)',
        location: location,
        image: avatar || 'https://rickandmortyapi.com/api/character/avatar/19.jpeg',
        episode: []
    };

    customCharacters.unshift(newChar);
    localStorage.setItem('customCharacters', JSON.stringify(customCharacters));

    cerrarModal('modal-crear-personaje');
    showToast(`¡${name} ha sido clonado/creado!`, "success");
    
    if (activeTab === 'personajes') cargarPersonajes();
    cargarDashboardStats();
}

async function abrirModalEditar(id) {
    const form = document.getElementById('form-editar-personaje');
    if(form) form.reset();

    try {
        let char;
        const isCustom = isNaN(id) || id.toString().startsWith('custom_');

        if (isCustom) {
            char = customCharacters.find(c => c.id.toString() === id.toString());
        } else {
            const res = await fetchWithCache(`${API_URL}/character/${id}`);
            char = await res.json();
            const edit = editedCharacters.find(ec => ec.id === char.id);
            if (edit) char = { ...char, ...edit };
        }

        if (!char) {
            showToast("No se localizó el sujeto", "error");
            return;
        }

        document.getElementById('edit-personaje-id').value = id;
        document.getElementById('edit-personaje-nombre').value = char.name;
        document.getElementById('edit-personaje-status').value = char.status;
        document.getElementById('edit-personaje-especie').value = char.species;
        document.getElementById('edit-personaje-genero').value = char.gender;
        document.getElementById('edit-personaje-location').value = char.location ? (char.location.name || char.location) : '';
        document.getElementById('edit-personaje-avatar').value = char.image || '';

        document.getElementById('edicion-personaje')?.showModal();
    } catch (e) {
        console.error("Error al cargar datos para editar:", e);
        showToast("Error al abrir portal de edición", "error");
    }
}

function guardarEdicionPersonaje(e) {
    e.preventDefault();
    const id = document.getElementById('edit-personaje-id').value;
    const name = document.getElementById('edit-personaje-nombre').value.trim();
    const status = document.getElementById('edit-personaje-status').value;
    const species = document.getElementById('edit-personaje-especie').value.trim();
    const gender = document.getElementById('edit-personaje-genero').value;
    const location = document.getElementById('edit-personaje-location').value.trim();
    const avatar = document.getElementById('edit-personaje-avatar').value.trim();

    const isCustom = isNaN(id) || id.toString().startsWith('custom_');

    if (isCustom) {
        customCharacters = customCharacters.map(c => {
            if (c.id.toString() === id.toString()) {
                return { ...c, name, status, species, gender, location: location, image: avatar || c.image };
            }
            return c;
        });
        localStorage.setItem('customCharacters', JSON.stringify(customCharacters));
    } else {
        const numericId = parseInt(id);
        const editIndex = editedCharacters.findIndex(ec => ec.id === numericId);
        const newEdit = { id: numericId, name, status, species, gender, location: location, image: avatar };

        if (editIndex > -1) {
            editedCharacters[editIndex] = newEdit;
        } else {
            editedCharacters.push(newEdit);
        }
        localStorage.setItem('editedCharacters', JSON.stringify(editedCharacters));
    }

    cerrarModal('edicion-personaje');
    showToast("Mutaciones guardadas", "success");
    if (activeTab === 'personajes') cargarPersonajes();
    cargarDashboardStats();
}

function confirmarEliminarPersonaje(id, nombre) {
    if (confirm(`¿Vaporizar a ${nombre} de esta dimensión?`)) {
        const isCustom = isNaN(id) || id.toString().startsWith('custom_');
        
        if (isCustom) {
            customCharacters = customCharacters.filter(c => c.id.toString() !== id.toString());
            localStorage.setItem('customCharacters', JSON.stringify(customCharacters));
        } else {
            const numericId = parseInt(id);
            if (!deletedCharacterIds.includes(numericId)) {
                deletedCharacterIds.push(numericId);
                localStorage.setItem('deletedCharacterIds', JSON.stringify(deletedCharacterIds));
            }
        }
        
        showToast(`¡${nombre} desintegrado!`, "success");
        if (activeTab === 'personajes') cargarPersonajes();
        cargarDashboardStats();
    }
}

// ==========================================
// GESTIÓN DE EPISODIOS (CON ORDENAMIENTO)
// ==========================================
async function cargarEpisodios() {
    if (!currentUser) return;
    const tbody = document.getElementById('episodios-tbody');
    const loading = document.getElementById('loading-episodios');
    const paginador = document.getElementById('paginacion-episodios');

    if(!tbody || !loading || !paginador) return;

    tbody.innerHTML = '';
    loading.hidden = false;
    paginador.style.display = 'none';

    try {
        const url = `${API_URL}/episode?page=${episodePage}${searchEpTerm ? '&name=' + encodeURIComponent(searchEpTerm) : ''}`;
        const res = await fetchWithCache(url);
        const data = await res.json();
        if (res.offline) showToast('📦 Episodios cargados desde caché offline', 'info');
        
        episodeTotalPages = data.info ? data.info.pages : 1;
        let episodios = data.results || [];

        // Integrar cambios locales (Episodios editados)
        episodios = episodios.map(ep => {
            const edit = editedEpisodes.find(ee => ee.id === ep.id);
            return edit ? { ...ep, ...edit } : ep;
        });

        // LÓGICA DE ORDENAMIENTO ASC/DESC PARA EPISODIOS
        episodios.sort((a, b) => {
            let valA = a[epSortCol];
            let valB = b[epSortCol];
            if (epSortCol === 'id') {
                return epSortDir === 'asc' ? a.id - b.id : b.id - a.id;
            }
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
            return epSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        loading.hidden = true;
        actualizarIconosOrdenamientoEp();

        if (episodios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay episodios aquí.</td></tr>`;
            return;
        }

        episodios.forEach(ep => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${ep.id}</td>
                <td><strong>${ep.name}</strong></td>
                <td>${ep.air_date}</td>
                <td><span style="font-weight:bold; color:var(--color-secundario);">${ep.episode}</span></td>
                <td>
                    <button onclick="verPersonajesDeEpisodio('${ep.characters.join(',')}', '${ep.name.replace(/'/g, "\\'")}', '${ep.id}', '${ep.episode}', '${ep.air_date}')" class="btn-gris">Detalles</button>
                    <button onclick="abrirModalEditarEpisodio('${ep.id}')" class="btn-exito">Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        paginador.style.display = 'flex';
        const infoPageEp = document.getElementById('info-page-episodes');
        const btnPrevEp = document.getElementById('btn-prev-episodes');
        const btnNextEp = document.getElementById('btn-next-episodes');

        if(infoPageEp) infoPageEp.textContent = `Página ${episodePage} de ${episodeTotalPages}`;
        if(btnPrevEp) btnPrevEp.disabled = (episodePage <= 1);
        if(btnNextEp) btnNextEp.disabled = (episodePage >= episodeTotalPages);

    } catch (e) {
        console.error("Error al cargar episodios:", e);
        loading.hidden = true;
    }
}

async function verPersonajesDeEpisodio(urlsString, episodeName, id, code, airDate) {
    if (!currentUser) return;
    if (!urlsString) return;
    const urls = urlsString.split(',');
    
    const dialog = document.getElementById('detalle-personaje');
    const body = document.getElementById('detail-body');
    const title = document.getElementById('detail-title');
    if(!dialog || !body) return;
    
    if (title) title.textContent = `Detalles del Episodio`;
    body.innerHTML = '<div class="loading-container"><div class="portal-spinner"></div><div class="loading-text">Cargando personajes...</div></div>';
    dialog.showModal();
    
    let displayedName = episodeName;
    let displayedCode = code;
    let displayedAirDate = airDate;
    
    const edit = editedEpisodes.find(ee => ee.id.toString() === id.toString());
    if (edit) {
        displayedName = edit.name;
        displayedCode = edit.episode;
        displayedAirDate = edit.air_date;
    }
    
    try {
        const characters = await Promise.all(
            urls.map(url => fetchWithCache(url).then(r => r.json()))
        );
        
        body.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid var(--color-borde); padding-bottom: 15px;">
                <h4 style="font-family: var(--fuente-titulo); font-size: 1.5rem; font-weight: 800; color: var(--color-secundario);">${displayedName}</h4>
                <div style="display: flex; justify-content: center; gap: 20px; margin-top: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem; opacity: 0.8;">Código: <strong>${displayedCode}</strong></span>
                    <span style="font-size: 0.9rem; opacity: 0.8;">Fecha de Emisión: <strong>${displayedAirDate}</strong></span>
                    <span style="font-size: 0.9rem; opacity: 0.8;">ID del Episodio: <strong>${id}</strong></span>
                </div>
            </div>
            
            <div style="text-align: left; margin-bottom: 10px;">
                <h5 style="font-family: var(--fuente-titulo); font-weight: 700; margin-bottom: 10px;">Personajes en este Episodio (${characters.length})</h5>
            </div>
            <div style="max-height: 40vh; overflow-y: auto;">
                <ul style="list-style: none; display: flex; flex-direction: column; gap: 10px; padding: 0;">
                    ${characters.map(c => `
                        <li style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: var(--radio-borde); border: 1px solid var(--color-borde);">
                            <img src="${c.image}" alt="${c.name}" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid var(--color-secundario);">
                            <div style="text-align: left;">
                                <strong style="font-size: 1rem; color: var(--color-primario); display: block;">${c.name}</strong>
                                <span style="font-size: 0.8rem; opacity: 0.7;">${c.species} - ${c.status === 'Alive' ? 'Vivo' : c.status === 'Dead' ? 'Muerto' : 'Desconocido'}</span>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    } catch (e) {
        console.error("Error al cargar detalles del episodio:", e);
        body.innerHTML = '<p>Error al obtener la lista de personajes del episodio.</p>';
    }
}

async function abrirModalEditarEpisodio(id) {
    const form = document.getElementById('form-editar-episodio');
    if(form) form.reset();

    try {
        let ep;
        const edit = editedEpisodes.find(ee => ee.id.toString() === id.toString());
        if (edit) {
            ep = edit;
        } else {
            const res = await fetchWithCache(`${API_URL}/episode/${id}`);
            ep = await res.json();
        }

        if (!ep) {
            showToast("No se localizó el episodio", "error");
            return;
        }

        document.getElementById('edit-episode-id').value = id;
        document.getElementById('edit-episode-name').value = ep.name;
        document.getElementById('edit-episode-date').value = ep.air_date;
        document.getElementById('edit-episode-code').value = ep.episode;

        document.getElementById('modal-editar-episodio')?.showModal();
    } catch (e) {
        console.error("Error al cargar datos para editar episodio:", e);
        showToast("Error al abrir portal de edición de episodio", "error");
    }
}

function guardarEdicionEpisodio(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-episode-id').value);
    const name = document.getElementById('edit-episode-name').value.trim();
    const air_date = document.getElementById('edit-episode-date').value.trim();
    const episode = document.getElementById('edit-episode-code').value.trim();

    const editIndex = editedEpisodes.findIndex(ee => ee.id === id);
    const newEdit = { id, name, air_date, episode };

    if (editIndex > -1) {
        editedEpisodes[editIndex] = newEdit;
    } else {
        editedEpisodes.push(newEdit);
    }
    localStorage.setItem('editedEpisodes', JSON.stringify(editedEpisodes));

    cerrarModal('modal-editar-episodio');
    showToast("Episodio modificado guardado con éxito", "success");
    cargarEpisodios();
}

function cambiarPaginaEpisodio(amount) {
    episodePage += amount;
    if (episodePage < 1) episodePage = 1;
    if (episodePage > episodeTotalPages) episodePage = episodeTotalPages;
    cargarEpisodios();
    const vista = document.getElementById('vista-episodios');
    if(vista) vista.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// ORDENAMIENTO (ICONOS Y SELECCIÓN)
// ==========================================
function actualizarIconosOrdenamientoChar() {
    const cols = ['id', 'name', 'species', 'gender', 'type'];
    cols.forEach(col => {
        const icon = document.getElementById(`sort-icon-char-${col}`);
        if (icon) {
            if (charSortCol === col) {
                icon.textContent = charSortDir === 'asc' ? '▲' : '▼';
            } else {
                icon.textContent = '↕';
            }
        }
    });
}

function actualizarIconosOrdenamientoEp() {
    const cols = ['id', 'name', 'air_date', 'episode'];
    cols.forEach(col => {
        const icon = document.getElementById(`sort-icon-ep-${col}`);
        if (icon) {
            if (epSortCol === col) {
                icon.textContent = epSortDir === 'asc' ? '▲' : '▼';
            } else {
                icon.textContent = '↕';
            }
        }
    });
}

// ==========================================
// UTILIDADES MODALES
// ==========================================
function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && typeof modal.close === 'function') {
        modal.close();
    }
}