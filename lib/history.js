'use strict'
// history
// external modules

// core
var config = require('./config')
var logger = require('./logger')
var response = require('./response')
var models = require('./models')
var alert = require('alert-node')

// public
var History = {
  historyGet: historyGet,
  historyPost: historyPost,
  historyDelete: historyDelete,
  updateHistory: updateHistory
}

function getHistory(userid, callback) {
  models.Note.all().then(function (notes) {
    return callback(null, notes);
  });
}

function setHistory(userid, history, callback) {
  models.Note.update({
    tags: history.tags.join(",")
  }, {
    where: {
      namespace: history.namespace
    }
  }).then(function (count) {
    return callback(null, count)
  }).catch(function (err) {
    logger.error('set history failed: ' + err)
    return callback(err, null)
  })
}

function updateHistory(userid, noteId, document, time) {
  if (userid && noteId && typeof document !== 'undefined') {
    getHistory(userid, function (err, history) {
      var targetHistory = {};
      history.forEach(function (val) {
        if (val.namespace === noteId) {
          targetHistory = val;
        }
      });
      if (err || !targetHistory) return
      var noteHistory = targetHistory
      var noteInfo = models.Note.parseNoteInfo(document)
      noteHistory.id = noteId
      noteHistory.text = noteInfo.title
      noteHistory.time = time || Date.now()
      noteHistory.tags = noteInfo.tags
      setHistory(userid, noteHistory, function (err, count) {
        if (err) {
          logger.log(err)
        }
      })
    })
  }
}

function parseHistoryToArray(history) {
  var _history = []
  Object.keys(history).forEach(function (key) {
    var item = history[key]
    _history.push(item)
  })
  return _history
}

function parseHistoryToObject(history) {
  var _history = {}
  for (var i = 0, l = history.length; i < l; i++) {
    var item = history[i]
    _history[item.id] = item
  }
  return _history
}

function historyGet(req, res) {
  if (req.isAuthenticated()) {
    getHistory(req.user.id, function (err, history) {
      if (err) return response.errorInternalError(res)
      if (!history) return response.errorNotFound(res)

      res.send({
        history: parseHistoryToArray(history)
      })
    })
  } else {
    return response.errorForbidden(res)
  }
}

function historyPost(req, res) {}

function historyDelete(req, res) {}

module.exports = History
