/* eslint-env browser, jquery */
/* global serverurl, Cookies, moment */

import store from 'store'
import S from 'string'

export function fileExists (filePath, callback) {
  $.ajax({
    url: `${serverurl}/fileexists?path=${filePath}`,
    type: 'GET'
  })
    .done(result => callback(null, result))
    .fail((xhr, status, error) => {
      console.error(xhr.responseText)
      return callback(error, null)
    })
}

export function createFile (filePath, callback) {
  $.ajax({
    url: `${serverurl}/createfile?path=${filePath}`,
    type: 'GET'
  })
    .done(result => callback(null, result))
    .fail((xhr, status, error) => {
      console.error(xhr.responseText)
      return callback(error, null)
    })
}