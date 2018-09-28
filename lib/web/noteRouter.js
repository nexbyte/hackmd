'use strict'

const Router = require('express').Router

const response = require('../response')

const noteRouter = module.exports = Router()

// get new note
noteRouter.get('/new', response.newNote)
noteRouter.get('/newnotepath', response.saveNotePath)
// get publish note
noteRouter.get('/s/:shortid', response.showPublishNote)

noteRouter.get('/open', response.openAction)
// publish note actions
noteRouter.get('/s/:shortid/:action', response.publishNoteActions)
// get publish slide
noteRouter.get('/p/:shortid', response.showPublishSlide)
// publish slide actions
noteRouter.get('/p/:shortid/:action', response.publishSlideActions)
// get note by id
noteRouter.get('/:noteId', response.showNote)
// note actions
noteRouter.get('/:noteId/:action', response.noteActions)
// note actions with action id
noteRouter.get('/:noteId/:action/:actionId', response.noteActions)

