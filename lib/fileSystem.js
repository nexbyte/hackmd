'use strict'
// history
// external modules

// core
var config = require('./config')
var logger = require('./logger')
var response = require('./response')
var models = require('./models')
var alert = require('alert-node')
var url = require('url');

var fs = require('fs')
var path = require('path')

// public
var FileSystem = {
  fileExists: fileExists,
  createFile: createFile
}

function fileExists(req, res) {
  if (req.isAuthenticated()) {

    // Get path
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var filePath = config.docspath + query.path;

    res.send({
      filePath: filePath,
      fileExists: fs.existsSync(filePath)
    })
  } else {
    return response.errorForbidden(res)
  }
}

function createFile(req, res){
  if (req.isAuthenticated()) {

    // Get path
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var filePath = config.docspath + query.path;

    var error;

    fs.writeFile(filePath, 'New File created', function(err) {
      if(err) {
          error = error;
      }
  
      console.log("The file was saved!");
    }); 

    if(!error){
      res.send({
        success: true,
        filePath: filePath
      })
    }else{
      res.send({
        error: error,
      })
    }


  } else {
    return response.errorForbidden(res)
  }
}

module.exports = FileSystem
