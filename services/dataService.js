const fs   = require('fs'),
      path = require('path'),
      { dataPath } = require('../config/config');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataPath, file), 'utf-8'));
}

module.exports = {
  getUsuarios:   () => readJSON('usuarios.json'),
  getCursos:     () => readJSON('cursos.json'),
  getStats:      () => readJSON('stats.json'),
  getHistory:    () => readJSON('history.json'),
  getGrades:     () => readJSON('grades.json'),
  getDiagnostic: () => readJSON('diagnostic.json')
};
