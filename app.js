const express = require('express');
const morgan = require('morgan');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const { port } = require('./config/config');
const dataService = require('./services/dataService');

const app = express();
// Config EJS + layouts
app.locals.appName = 'EduTrack';
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/layout');

// Estáticos + logger + bodyParser
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: false }));

// Simulación de login por query ?userId=
app.use((req, res, next) => {
  const uid = parseInt(req.query.userId) || 1;
  const u = dataService.getUsuarios().find(x => x.id === uid);
  if (!u) return res.redirect('/forbidden');
  req.user = u;
  res.locals.user = u;
  next();
});

app.use((req, res, next) => {
  res.locals.showNavbar = true;
  next();
});

app.get('/login', (req, res, next) => {
  const uid = parseInt(req.query.userId);
  if (!uid) {
    // Solo mostrar formulario
    return res.render('login', { title: 'Login', showNavbar: false });
  }
  // Intento de login con ID
  const user = dataService.getUsuarios().find(u => u.id === uid);
  if (!user) {
    // Usuario no válido: vuelve al login con mensaje opcional
    return res.render('login', { 
      title: 'Login', 
      showNavbar: false,
      error: 'Usuario no encontrado' 
    });
  }
  // Redirigir según rol
  switch (user.role) {
    case 'administrador':
      return res.redirect(`/admin?userId=${user.id}`);
    case 'profesor':
      return res.redirect(`/profesores?userId=${user.id}`);
    case 'estudiante':
      return res.redirect(`/dashboard?userId=${user.id}`);
    default:
      return res.redirect(`/dashboard?userId=${user.id}`);
  }
});

// Autorización y manejo de “sin permisos”
const permit = (...roles) => (req, res, next) => {
  if (roles.includes(req.user.role)) return next();
  res.redirect('/forbidden');
};

// Rutas generación
app.get('/', (req, res) => res.render('index', { title: 'Inicio' }));
app.get('/login', (req, res) => res.render('login', { title: 'Login' }));

// Forbidden
app.get('/forbidden', (req, res) => {
  res.status(403).render('forbidden', { title: 'Acceso Denegado' });
});

// Dashboard para estudiante/profesor/admin
app.get('/dashboard', permit('estudiante', 'profesor', 'administrador'), (req, res) => {
  const cursos = dataService.getCursos()
    .filter(c => req.user.role !== 'profesor' || c.profesorId === req.user.id);
  res.render('dashboard', { title: 'Dashboard', cursos });
});

// Gestión de cursos (profesor+admin)
app.get('/cursos', permit('profesor', 'administrador'), (req, res) => {
  const cursos = dataService.getCursos()
    .filter(c => req.user.role !== 'profesor' || c.profesorId === req.user.id);
  res.render('cursos', { title: 'Gestionar Cursos', cursos });
});

// Ver un curso
app.get('/curso/:id', permit('estudiante', 'profesor', 'administrador'), (req, res) => {
  const curso = dataService.getCursos().find(c => c.id == req.params.id);
  if (!curso) return res.redirect('/forbidden');
  res.render('curso', { title: curso.titulo, curso });
});

app.get('/perfil', (req, res) => {
  const base = dataService.getUsuarios().find(u => u.id === req.user.id);
  const role = base.role;
  const allCourses = dataService.getCursos();
  const history    = dataService.getHistory ? dataService.getHistory() : [];

  // Datos comunes de estudiante
  const cursosCompletados = allCourses.filter(c => c.progreso >= 100).length;
  const cursosEnProgreso  = allCourses.filter(c => c.progreso < 100).length;
  const testsRealizados   = history.length;
  const ultimosCursos     = allCourses.slice(0, 3);

  // Datos profesor
  const misCursos = allCourses.filter(c => c.profesorId === base.id);
  const notas     = dataService.getGrades ? dataService.getGrades()
                      .filter(n => misCursos.some(c => c.titulo === n.curso)) : [];

  // Datos admin
  const totalUsuarios = dataService.getUsuarios().length;
  const totalCursos   = allCourses.length;

  // Construyo user con defaults
  const user = Object.assign({}, base, {
    cursosCompletados: 0,
    cursosEnProgreso:  0,
    testsRealizados:   0,
    ultimosCursos:     [],
    misCursos:         [],
    notas:             [],
    totalUsuarios:     0,
    totalCursos:       0
  });

  // Sobre-escribo según rol
  if (role === 'estudiante') {
    Object.assign(user, { cursosCompletados, cursosEnProgreso, testsRealizados, ultimosCursos });
  } else if (role === 'profesor') {
    Object.assign(user, { misCursos, notas });
  } else if (role === 'administrador') {
    Object.assign(user, { totalUsuarios, totalCursos });
  }

  res.render('perfil', {
    title: 'Perfil',
    user,
    userId: base.id
  });
});
// Admin panel
app.get('/admin', permit('administrador'), (req, res) => {
  const usuarios = dataService.getUsuarios();
  const cursos = dataService.getCursos();
  res.render('admin', { title: 'Panel Admin', usuarios, cursos });
});

// Profesores: ver notas y subir cursos
app.get('/profesores', permit('profesor', 'administrador'), (req, res) => {
  // simular notas de estudiantes
  const notas = [
    { estudiante: 'Juan Pérez', curso: 'Matemáticas Avanzadas', nota: 85 },
    { estudiante: 'Ana López', curso: 'Introducción a JavaScript', nota: 72 }
  ];
  const misCursos = dataService.getCursos().filter(c => c.profesorId === req.user.id);
  res.render('profesores', { title: 'Mis Cursos', cursos: misCursos, notas });
});
// manejar nuevo curso (form POST)
app.post('/profesores', permit('profesor', 'administrador'), (req, res) => {
  // aquí iría la lógica de guardado real
  console.log('Nuevo curso:', req.body);
  res.redirect(`/profesores?userId=${req.user.id}`);
});

// Recomendados (estudiante)
app.get('/recommend', permit('estudiante'), (req, res) => {
  const recs = dataService.getCursos().filter(c => c.progreso < 50);
  res.render('recommend', { title: 'Recomendados', cursos: recs });
});

// Historial tests (estudiante)
app.get('/history', permit('estudiante'), (req, res) => {
  const history = [
    { test: 'Álgebra', fecha: '2025-04-10', nota: 85 },
    { test: 'Cálculo', fecha: '2025-04-15', nota: 78 }
  ];
  res.render('history', { title: 'Historial Tests', history });
});

// Estadísticas con Chart.js (estudiante)
app.get('/stats', permit('estudiante'), (req, res) => {
  const stats = dataService.getStats();  // ahora es [{area, score},...]
  res.render('stats', { title: 'Estadísticas', stats, userId: req.user.id });
});

// Historial tests (estudiante)
app.get('/history', permit('estudiante'), (req, res) => {
  const history = dataService.getHistory();
  res.render('history', {
    title: 'Historial Tests',
    history,
    userId: req.user.id
  });
});

// Notas para profesor
app.get('/profesores', permit('profesor', 'administrador'), (req, res) => {
  const misCursos = dataService.getCursos().filter(c => c.profesorId === req.user.id);
  const notas = dataService.getGrades();
  res.render('profesores', {
    title: 'Mis Cursos',
    cursos: misCursos,
    notas,
    userId: req.user.id
  });
});

// Test diagnóstico (estudiante)
app.get('/diagnostic', permit('estudiante'), (req, res) => {
  const preguntas = dataService.getDiagnostic();
  res.render('diagnostic', {
    title: 'Test Diagnóstico',
    preguntas,
    userId: req.user.id
  });
});
app.post('/diagnostic', permit('estudiante'), (req, res) => {
  const preguntas = dataService.getDiagnostic();
  let resultados = {};
  preguntas.forEach(p => {
    const resp = req.body[`p${p.id}`];
    const valor = p.opciones.find(o => o[resp] !== undefined)[resp];
    resultados[p.area] = (resultados[p.area] || 0) + valor;
  });
  res.render('diagnostic-result', {
    title: 'Resultados Diagnóstico',
    resultados,
    userId: req.user.id
  });
});

app.get('/test', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'estudiante') return res.redirect('/login');
  res.render('test', { user: req.session.user });
});

app.post('/test/enviar', (req, res) => {
  const respuestas = req.body;
  const resultados = {};

  for (let materia in respuestas) {
    const valores = Array.isArray(respuestas[materia]) ? respuestas[materia].map(Number) : [0];
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    resultados[materia] = parseFloat(promedio.toFixed(1));
  }

  // Guardar en un archivo JSON (simulación de base de datos)
  const fs = require('fs');
  const path = require('path');
  const statsPath = path.join(__dirname, 'data', `stats-${req.session.user.id}.json`);
  fs.writeFileSync(statsPath, JSON.stringify(resultados, null, 2));

  res.redirect('/estadisticas');
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));