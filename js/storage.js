// Persistencia del simulacro: tema, simulacro en curso e historial de resultados.
// Toda lectura y escritura pasa por aquí; para guardar en una base de datos basta
// con reimplementar estas funciones manteniendo sus nombres.
const Store = (() => {
  const PREFIX = "stp.";
  const MAX_RESULTS = 200;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Sin almacenamiento disponible (modo privado, cuota llena): solo dura esta visita.
      return false;
    }
  }

  return {
    getTheme: () => read("tema", null),
    setTheme: (theme) => write("tema", theme),

    loadSession: () => read("sesion", null),
    saveSession: (session) => write("sesion", session),
    clearSession: () => write("sesion", null),

    listResults: () => read("resultados", []),
    addResult(result) {
      const results = read("resultados", []);
      results.unshift(result);
      write("resultados", results.slice(0, MAX_RESULTS));
    },
    clearResults: () => write("resultados", null),
  };
})();
