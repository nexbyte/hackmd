'use strict'
// response
// external modules
var fs = require('fs')
var markdownpdf = require('markdown-pdf')
var LZString = require('lz-string')
var shortId = require('shortid')
var querystring = require('querystring')
var request = require('request')
var moment = require('moment')
var path = require('path')
var alert = require('alert-node');
var firstline = require("firstline");
var fileExists = require('file-exists');
var url = require('url');
var stream = require('stream');

var pdf = require('html-pdf');

// core
var config = require('./config')
var logger = require('./logger')
var models = require('./models')
var utils = require('./utils')

var HACKMD_FILE_CODE_PRAEFFIX = '<!-- hackmd:';
var HACKMD_FILE_CODE_SUFFIX = ' -->';

// public
var response = {
  errorForbidden: function (res) {
    responseError(res, '403', 'Forbidden', 'oh no.')
  },
  errorNotFound: function (res) {
    responseError(res, '404', 'Not Found', 'oops.')
  },
  errorBadRequest: function (res) {
    responseError(res, '400', 'Bad Request', 'something not right.')
  },
  errorInternalError: function (res) {
    responseError(res, '500', 'Internal Error', 'wtf.')
  },
  errorServiceUnavailable: function (res) {
    res.status(503).send("I'm busy right now, try again later.")
  },
  newNote: newNote,
  saveNotePath: saveNotePath,
  showNote: showNote,
  showPublishNote: showPublishNote,
  showPublishSlide: showPublishSlide,
  showIndex: showIndex,
  noteActions: noteActions,
  publishNoteActions: publishNoteActions,
  publishSlideActions: publishSlideActions,
  githubActions: githubActions,
  gitlabActions: gitlabActions,
  openAction: openAction,
}

function responseError(res, code, detail, msg) {
  res.status(code).render(config.errorpath, {
    url: config.serverurl,
    title: code + ' ' + detail + ' ' + msg,
    code: code,
    detail: detail,
    msg: msg,
    useCDN: config.usecdn
  })
}

function showIndex(req, res, next) {
  res.render(config.indexpath, {
    url: config.serverurl,
    useCDN: config.usecdn,
    namespace: null,
    allowAnonymous: config.allowanonymous,
    facebook: config.isFacebookEnable,
    twitter: config.isTwitterEnable,
    github: config.isGitHubEnable,
    gitlab: config.isGitLabEnable,
    mattermost: config.isMattermostEnable,
    dropbox: config.isDropboxEnable,
    google: config.isGoogleEnable,
    ldap: config.isLDAPEnable,
    email: config.isEmailEnable,
    allowemailregister: config.allowemailregister,
    allowpdfexport: config.allowpdfexport,
    signin: req.isAuthenticated(),
    infoMessage: req.flash('info'),
    errorMessage: req.flash('error')
  })
}

function responseHackMD(res, note) {
  var body = note.content
  var extracted = models.Note.extractMeta(body)
  var meta = models.Note.parseMeta(extracted.meta)
  var title = models.Note.decodeTitle(note.title)
  title = models.Note.generateWebTitle(meta.title || title)
  res.set({
    'Cache-Control': 'private', // only cache by client
    'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
  })
  res.render(config.hackmdpath, {
    url: config.serverurl,
    title: title,
    note: note,
    useCDN: config.usecdn,
    allowAnonymous: config.allowanonymous,
    facebook: config.isFacebookEnable,
    twitter: config.isTwitterEnable,
    github: config.isGitHubEnable,
    gitlab: config.isGitLabEnable,
    mattermost: config.isMattermostEnable,
    dropbox: config.isDropboxEnable,
    google: config.isGoogleEnable,
    ldap: config.isLDAPEnable,
    email: config.isEmailEnable,
    allowemailregister: config.allowemailregister,
    allowpdfexport: config.allowpdfexport
  })
}

function responseNewNote(res, note) {
  res.render(config.indexpath, {
    url: config.serverurl,
    useCDN: config.usecdn,
    note: note,
    namespace: note.namespace,
    allowAnonymous: config.allowanonymous,
    facebook: config.isFacebookEnable,
    twitter: config.isTwitterEnable,
    github: config.isGitHubEnable,
    gitlab: config.isGitLabEnable,
    mattermost: config.isMattermostEnable,
    dropbox: config.isDropboxEnable,
    google: config.isGoogleEnable,
    ldap: config.isLDAPEnable,
    email: config.isEmailEnable,
    allowemailregister: config.allowemailregister,
    allowpdfexport: config.allowpdfexport,
  })
}

function saveNotePath(req, res) {

  var url_parts = url.parse(req.url, true);
  var query = url_parts.query;
  var filePath = query.filePath;
  var namespace = query.namespace;

  // Check if you got the new one
    var saveNote;

    models.Note.update({
      filePath: filePath
    }, {
      where: {
        namespace: namespace
      }
    });

    models.Note.findOne({
      where: {
        namespace: namespace
      }
    }).then(function (note) {

      // Write to the file on the filesystem
      fs.writeFile(filePath, note.get('content'), function (err) {
        logger.error(err);
      });
      }).catch(function (error) {
        return responseHackMD(res, saveNote);
      });

      return res.redirect(config.serverurl + '/' + namespace + '');
    }

    function newNote(req, res, next) {

      var owner = null
      if (req.isAuthenticated()) {
        owner = req.user.id
      } else if (!config.allowanonymous) {
        return response.errorForbidden(res)
      }

      var now = new Date();

      models.Note.create({
        ownerId: owner
      }).then(function (note) {
        var namespace = LZString.compressToBase64(note.id);
        var newContent = HACKMD_FILE_CODE_PRAEFFIX + namespace + HACKMD_FILE_CODE_SUFFIX + '\n' + '\n' + 'Neues Dokument' + '\n' + '===';

        models.Note.update({
          content: newContent,
          namespace: namespace
        }, {
          where: {
            id: note.get('id')
          }
        });

        return res.redirect(config.serverurl + '/' + namespace + '?both')
      }).catch(function (err) {
        logger.error(err)
        return response.errorInternalError(res)
      })
    }

    function checkViewPermission(req, note) {
      if (note.permission === 'private') {
        if (!req.isAuthenticated() || note.ownerId !== req.user.id) {
          return false
        } else {
          return true
        }
      } else if (note.permission === 'limited' || note.permission === 'protected') {
        if (!req.isAuthenticated()) {
          return false
        } else {
          return true
        }
      } else {
        return true
      }
    }

    function findNote(req, res, callback, include) {

      var noteId = req.params.noteId
      var id = req.params.noteId || req.params.shortid
      models.Note.parseNoteId(id, function (err, _id) {
        if (err) {
          logger.log(err)
        }
        models.Note.findOne({
          where: {
            id: _id
          },
          include: include || null
        }).then(function (note) {
          if (!note) {
            if (config.allowfreeurl && noteId) {
              req.alias = noteId
              return newNote(req, res)
            } else {
              return response.errorNotFound(res)
            }
          }
          if (!checkViewPermission(req, note)) {
            return response.errorForbidden(res)
          } else {
            return callback(note)
          }
        }).catch(function (err) {
          logger.error(err)
          return response.errorInternalError(res)
        })
      })
    }

    function showNote(req, res, next) {
      findNote(req, res, function (note) {
        // force to use note id
        var noteId = req.params.noteId
        var id = LZString.compressToBase64(note.id)
        if ((note.alias && noteId !== note.alias) || (!note.alias && noteId !== id)) {
          return res.redirect(config.serverurl + '/' + (note.alias || id))
        }
        return responseHackMD(res, note)
      })
    }

    function openAction(req, res, next) {
      var redirect;
      var beautifulQuery;

      if (req._parsedUrl.query.endsWith('.md')) {
        beautifulQuery = req._parsedUrl.query;
      } else {
        beautifulQuery = req._parsedUrl.query + ".md";
      }

      var file = path.join(config.docspath, beautifulQuery);

      logger.info("Debug from " + config.docspath);
      fs.readdir(config.docspath, (err, files) => {
        files.forEach(file => {
          logger.info("Found file '" + file + "' -> " + config.docspath + '/' + file);
        });
      });

      if (fs.existsSync(file)) {
        firstline(file).then(function (value) {

          var noteid;
          var recreateNoteId;
          var recreate = false;

          var owner = null
          if (req.isAuthenticated()) {
            owner = req.user.id
          }

          if (value.match(/<!-- hackmd:(.*)? -->/g)) {
            value = value.replace(HACKMD_FILE_CODE_PRAEFFIX, "");
            value = value.replace(HACKMD_FILE_CODE_SUFFIX, "");
            value = value.replace(" ", "");
            noteid = value;

            models.Note.findOne({
              where: {
                namespace: value
              }
            }).then(function (note) {
              if (!note) {
                var content;
                fs.readFile(file, function read(err, data) {
                  content = data + "";
                  content = content.replace(/<!-- hackmd:(.*)? -->/g, '');

                  fs.writeFile(file, content, function (err) {
                    logger.error(err);
                  });

                  models.Note.create({
                    ownerId: null,
                    filePath: file,
                    content: content
                  }).then(function (note) {
                    var newContent = HACKMD_FILE_CODE_PRAEFFIX + LZString.compressToBase64(note.id) + HACKMD_FILE_CODE_SUFFIX + '\n' + '\n' + content;
                    models.Note.update({
                      content: newContent,
                      namespace: LZString.compressToBase64(note.id)
                    }, {
                      where: {
                        id: note.get('id')
                      }
                    });

                    fs.writeFile(note.get('filePath'), newContent, function (err) {});
                    recreateNoteId = LZString.compressToBase64(note.id);
                    recreate = true;
                    return res.redirect(config.serverurl + '/' + recreateNoteId);

                  }).catch(function (err) {
                    logger.error(err)
                    return response.errorInternalError(res)
                  });
                });
              } else {
                return res.redirect(config.serverurl + '/' + noteid);
              }
            });

          } else {
            var content;

            fs.readFile(file, function read(err, data) {
              if (err) {
                throw err;
              }

              content = data;

              var currentNote;
              models.Note.create({
                ownerId: owner,
                filePath: file,
                content: content
              }).then(function (note) {
                var newContent = HACKMD_FILE_CODE_PRAEFFIX + LZString.compressToBase64(note.id) + HACKMD_FILE_CODE_SUFFIX + '\n' + '\n' + content;

                models.Note.update({
                  content: newContent,
                  namespace: LZString.compressToBase64(note.id)
                }, {
                  where: {
                    id: note.get('id')
                  }
                });

                fs.writeFile(note.get('filePath'), newContent, function (err) {});
                return res.redirect(config.serverurl + '/' + LZString.compressToBase64(note.id));

              }).catch(function (err) {
                logger.error(err)
                return response.errorInternalError(res)
              });
            });
          }
        });
      } else {
        logger.error("The file " + file + " doesn't exist!");
        return res.redirect(config.serverurl + '/404');
      }
    }

    function showPublishNote(req, res, next) {
      var include = [{
        model: models.User,
        as: 'owner'
      }, {
        model: models.User,
        as: 'lastchangeuser'
      }]
      findNote(req, res, function (note) {

        // force to use short id
        var shortid = req.params.shortid
        if ((note.alias && shortid !== note.alias) || (!note.alias && shortid !== note.shortid)) {
          return res.redirect(config.serverurl + '/s/' + (note.alias || note.shortid))
        }
        note.increment('viewcount').then(function (note) {
          if (!note) {
            return response.errorNotFound(res)
          }
          var body = note.content
          var extracted = models.Note.extractMeta(body)
          var markdown = extracted.markdown
          var meta = models.Note.parseMeta(extracted.meta)
          var createtime = note.createdAt
          var updatetime = note.lastchangeAt
          var title = models.Note.decodeTitle(note.title)
          title = models.Note.generateWebTitle(meta.title || title)
          var origin = config.serverurl
          var data = {
            title: title,
            description: meta.description || (markdown ? models.Note.generateDescription(markdown) : null),
            viewcount: note.viewcount,
            createtime: createtime,
            updatetime: updatetime,
            url: origin,
            body: body,
            useCDN: config.usecdn,
            owner: note.owner ? note.owner.id : null,
            ownerprofile: note.owner ? models.User.getProfile(note.owner) : null,
            lastchangeuser: note.lastchangeuser ? note.lastchangeuser.id : null,
            lastchangeuserprofile: note.lastchangeuser ? models.User.getProfile(note.lastchangeuser) : null,
            robots: meta.robots || false, // default allow robots
            GA: meta.GA,
            disqus: meta.disqus
          }
          return renderPublish(data, res)
        }).catch(function (err) {
          logger.error(err)
          return response.errorInternalError(res)
        })
      }, include)
    }

    function renderPublish(data, res) {
      res.set({
        'Cache-Control': 'private' // only cache by client§
      })
      res.render(config.prettypath, data)
    }

    function actionPublish(req, res, note) {

      var pathToFile = path.join(config.docspath, note.get('alias') + '.md');
      var firstLineOfFile;
      var content;

      content = note.get("content");

      models.Note.update({
        content: content
      }, {
        where: {
          id: note.get('id')
        }
      });

      models.Revision.saveNoteRevision(note, function (err, revision) {
        if (err) {
          alert("The revision couldn't be created");
        }
      });

      if (note.get('filePath') !== null) {
        fs.writeFile(note.get('filePath'), content, function (err) {
          if (err) {
            alert("Publish failed -> " + err);
            return responseNewNote(res, note);
          } else {
            alert("Publish was successful");
            res.redirect(config.serverurl + '/s/' + (note.alias || note.shortid));
          }

        });
      } else {
        console.log("Response new");
        return responseNewNote(res, note);
      }
    }

    function actionSlide(req, res, note) {
      res.redirect(config.serverurl + '/p/' + (note.alias || note.shortid))
    }

    function actionDownload(req, res, note) {
      var body = note.content
      var title = models.Note.decodeTitle(note.title)
      var filename = title
      filename = encodeURIComponent(filename)
      res.set({
        'Access-Control-Allow-Origin': '*', // allow CORS as API
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
        'Content-Type': 'text/markdown; charset=UTF-8',
        'Cache-Control': 'private',
        'Content-disposition': 'attachment; filename=' + filename + '.md',
        'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
      })
      res.send(body)
    }

    function actionInfo(req, res, note) {
      var body = note.content
      var extracted = models.Note.extractMeta(body)
      var markdown = extracted.markdown
      var meta = models.Note.parseMeta(extracted.meta)
      var createtime = note.createdAt
      var updatetime = note.lastchangeAt
      var title = models.Note.decodeTitle(note.title)
      var data = {
        title: meta.title || title,
        description: meta.description || (markdown ? models.Note.generateDescription(markdown) : null),
        viewcount: note.viewcount,
        createtime: createtime,
        updatetime: updatetime
      }
      res.set({
        'Access-Control-Allow-Origin': '*', // allow CORS as API
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
        'Cache-Control': 'private', // only cache by client
        'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
      })
      res.send(data)
    }

    function actionPDF(req, res, note) {
      var body = note.content
      var extracted = models.Note.extractMeta(body)
      var title = models.Note.decodeTitle(note.title)

      if (!fs.existsSync(config.tmppath)) {
        fs.mkdirSync(config.tmppath)
      }
      var base = 'file:///' + path.join(__dirname, '../public');

      var options = 
        {
        format: 'Letter',
        type: 'pdf',
        base: base,
        quality: 100,
        header:
          {
          height: '4cm',
          contents: '<img src="http://localhost:3000/uploads/nextevent_schweiz_logo.svg" alt="Logo" style="height: 19mm" />'
          },

        footer:
          {
          height: '1.5cm',
          contents: ''
          }
        };

      var content = extracted.markdown;
      var html = "<style>img,table{max-width:100%}dl,ol,ul{margin-top:0}dl,hr,table{margin-bottom:20px}blockquote,dd{margin-left:0}*{overflow:visible!important;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;box-decoration-break:clone}body,html{background:#FFF;font-family:'Segoe UI',Arial,freesans,sans-serif;font-size:10px;line-height:1.4;color:#333;word-wrap:break-word;hyphens:auto}hr{margin-top:20px;border:0;border-top:4px solid #EEE}code{padding:.1em .4em;display:inline-block;background-color:#f9f2f4;color:#c7254e;border-radius:3px;border:0;font:9px Consolas,'Liberation Mono',Menlo,'Courier New',Courier,monospace;hyphens:manual}pre code{padding:15px;display:block;background-color:#F9F9F9;color:#555;font-size:10px;box-shadow:inset -1px -1px 0 rgba(0,0,0,.08);word-wrap:normal}code.ascetic-css,code.color-brewer-css,code.default-css,code.github-css,code.github-gist-css,code.googlecode-css,code.grayscale-css,code.idea-css,code.tomorrow-css,code.vs-css,code.xcode-css{background-color:#F9F9F9!important}table,table table{background-color:#FFF}blockquote{padding:10px;color:#666;border:0;border-left:4px solid #EEE}blockquote ol:last-child,blockquote p:last-child,blockquote ul:last-child{margin-bottom:0}table{border-collapse:collapse;border-spacing:0;width:100%;border:1px solid #DDD}table div{page-break-inside:avoid}td,th{text-align:left}table>caption+thead>tr:first-child>td,table>caption+thead>tr:first-child>th,table>colgroup+thead>tr:first-child>td,table>colgroup+thead>tr:first-child>th,table>thead:first-child>tr:first-child>td,table>thead:first-child>tr:first-child>th{border-top:0}table>tbody+tbody{border-top:2px solid #DDD}table>tbody>tr>td,table>tbody>tr>th,table>tfoot>tr>td,table>tfoot>tr>th,table>thead>tr>td,table>thead>tr>th{padding:8px 14px;vertical-align:top;border:1px solid #DDD}#pageHeader span,img{vertical-align:middle}table>thead>tr>td,table>thead>tr>th{border-bottom-width:2px;text-align:center;vertical-align:middle;font-weight:700;padding-top:6px;padding-bottom:6px;font-size:90%}table>tbody>tr:nth-of-type(odd){background-color:#F9F9F9}img{height:auto}h1,h2,h3,h4,h5,h6{font-family:inherit;font-weight:400;line-height:1.1;color:#111;margin-top:20px;margin-bottom:10px;padding:0;page-break-after:avoid}dt,h5,h6{font-weight:700}h1,h2{border-bottom:1px solid #EEE;padding-bottom:7px;margin-top:10px;margin-bottom:12px}h1{font-size:22px}h2{font-size:17px}h3{font-size:15px}h4{font-size:11px}h5,h6{font-size:10px;color:#666}p{margin:0 0 10px}input[type=checkbox]{margin-right:6px;position:relative;bottom:1px}ol,ul{margin-bottom:10px;padding-left:20px}ol li,ul li{margin-bottom:2px}a,a:visited{text-decoration:none;color:#4078C0}.new-page,.next-page,.page-break,.page-end{page-break-before:always}#pageFooter a,#pageFooter a:visited,#pageHeader,#pageHeader a,#pageHeader a:visited{color:#777}#pageFooter{border-top:1px solid #EEE;padding-top:5px;color:#777;font-size:80%}code,pre code,table>thead>tr>th{background-color:#EAEAEA}body,html{font-family:'Open Sans',Courier;font-size:9px;font-weight:lighter;color:#000}body{margin-left:19mm;margin-right:13mm}h1,h2,h3,h4,h5,h6{font-family:'Open Sans Semibold';border-bottom:0;padding:0;margin:0 0 10px}h1{font-size:15px;page-break-before:always}h1:first-of-type{page-break-before:auto}h2{font-size:13px;margin-top:20px;margin-bottom:8px}h3{font-size:12px}h4{font-size:11px}h5,h6{font-size:10px}code{color:#000;font:9px Consolas,'Liberation Mono',Menlo,'Courier New',Corpid,Courier,monospace;font-weight:lighter}pre{page-break-inside:avoid}pre code{padding:8px;border-radius:0}a,a:active,a:hover,a:visited,a[href]:after{color:inherit;text-decoration:none;border-bottom:1.5px solid gray}.subtitle,.title{#  color:#771316}#pageHeader{position:absolute;top:4mm;left:9mm;width:100%;height:100%}#pageFooter{border:0}ul{margin-top:0;padding-left:15px;list-style-type:square}table>thead>tr>th{text-align:left;border-bottom:0;padding:5px}table>tbody>tr:nth-of-type(odd){background-color:#FFF}table>tbody>tr>td{padding:5px}.title{margin-top:4cm;font-family:'Open Sans Semibold';font-size:26px}.subtitle{font-size:17px;font-weight:400}table.firstpage{margin-top:9cm;border:0 solid #fff;margin-left:0;padding-left:0}table.firstpage>tbody>tr>td,table.firstpage>tbody>tr>th{border:0 solid #fff;color:inherit;font-weight:inherit;background-color:inherit;margin-left:0;padding-left:0}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;src:url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.eot);src:local('Open Sans'),local('OpenSans'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.eot?#iefix) format('embedded-opentype'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.woff2) format('woff2'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.woff) format('woff'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.ttf) format('truetype'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-regular.svg#OpenSans) format('svg')}@font-face{font-family:'Open Sans Semibold';font-style:normal;font-weight:600;src:url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.eot);src:local('Open Sans Semibold'),local('OpenSans-Semibold'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.eot?#iefix) format('embedded-opentype'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.woff2) format('woff2'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.woff) format('woff'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.ttf) format('truetype'),url(http://dataserver.nexbyte.ch/web/nextevent/markdown-themeable-pdf/fonts/open-sans/open-sans-v13-greek-ext_latin-ext_cyrillic_latin_greek_cyrillic-ext_vietnamese-600.svg#OpenSans) format('svg')}</style>" + extracted.html;
      pdf.create(html, options).toBuffer(function (err, buffer) {
        var readStream = new stream.PassThrough();
        readStream.end(buffer);

        res.set('Content-disposition', 'attachment; filename=export.pdf');
        res.set('Content-Type', 'text/plain');

        readStream.pipe(res);
      });
    }

    function actionGist(req, res, note) {
      var data = {
        client_id: config.github.clientID,
        redirect_uri: config.serverurl + '/auth/github/callback/' + LZString.compressToBase64(note.id) + '/gist',
        scope: 'gist',
        state: shortId.generate()
      }
      var query = querystring.stringify(data)
      res.redirect('https://github.com/login/oauth/authorize?' + query)
    }

    function actionRevision(req, res, note) {
      var actionId = req.params.actionId
      if (actionId) {
        var time = moment(parseInt(actionId))
        if (time.isValid()) {
          models.Revision.getPatchedNoteRevisionByTime(note, time, function (err, content) {
            if (err) {
              logger.error(err)
              return response.errorInternalError(res)
            }
            if (!content) {
              return response.errorNotFound(res)
            }
            res.set({
              'Access-Control-Allow-Origin': '*', // allow CORS as API
              'Access-Control-Allow-Headers': 'Range',
              'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
              'Cache-Control': 'private', // only cache by client
              'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
            })
            res.send(content)
          })
        } else {
          return response.errorNotFound(res)
        }
      } else {
        models.Revision.getNoteRevisions(note, function (err, data) {
          if (err) {
            logger.error(err)
            return response.errorInternalError(res)
          }
          var out = {
            revision: data
          }
          res.set({
            'Access-Control-Allow-Origin': '*', // allow CORS as API
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
            'Cache-Control': 'private', // only cache by client
            'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
          })
          res.send(out)
        })
      }
    }

    function noteActions(req, res, next) {
      var noteId = req.params.noteId
      findNote(req, res, function (note) {
        var action = req.params.action
        switch (action) {
          case 'publish':
          case 'pretty': // pretty deprecated
            actionPublish(req, res, note)
            break
          case 'slide':
            actionSlide(req, res, note)
            break
          case 'download':
            actionDownload(req, res, note)
            break
          case 'info':
            actionInfo(req, res, note)
            break
          case 'pdf':
            if (config.allowpdfexport) {
              actionPDF(req, res, note)
            } else {
              logger.error('PDF export failed: Disabled by config. Set "allowpdfexport: true" to enable. Check the documentation for details')
              response.errorForbidden(res)
            }
            break
          case 'gist':
            actionGist(req, res, note)
            break
          case 'revision':
            actionRevision(req, res, note)
            break
          default:
            return res.redirect(config.serverurl + '/' + noteId)
        }
      })
    }

    function publishNoteActions(req, res, next) {

      findNote(req, res, function (note) {
        var action = req.params.action

        switch (action) {
          case 'edit':
            res.redirect(config.serverurl + '/' + (note.alias ? note.alias : LZString.compressToBase64(note.id)))
            break
          default:
            res.redirect(config.serverurl + '/s/' + note.shortid)
            break
        }
      })
    }

    function publishSlideActions(req, res, next) {
      findNote(req, res, function (note) {
        var action = req.params.action
        switch (action) {
          case 'edit':
            res.redirect(config.serverurl + '/' + (note.alias ? note.alias : LZString.compressToBase64(note.id)))
            break
          default:
            res.redirect(config.serverurl + '/p/' + note.shortid)
            break
        }
      })
    }

    function githubActions(req, res, next) {
      var noteId = req.params.noteId
      findNote(req, res, function (note) {
        var action = req.params.action
        switch (action) {
          case 'gist':
            githubActionGist(req, res, note)
            break
          default:
            res.redirect(config.serverurl + '/' + noteId)
            break
        }
      })
    }

    function githubActionGist(req, res, note) {
      var code = req.query.code
      var state = req.query.state
      if (!code || !state) {
        return response.errorForbidden(res)
      } else {
        var data = {
          client_id: config.github.clientID,
          client_secret: config.github.clientSecret,
          code: code,
          state: state
        }
        var authUrl = 'https://github.com/login/oauth/access_token'
        request({
          url: authUrl,
          method: 'POST',
          json: data
        }, function (error, httpResponse, body) {
          if (!error && httpResponse.statusCode === 200) {
            var accessToken = body.access_token
            if (accessToken) {
              var content = note.content
              var title = models.Note.decodeTitle(note.title)
              var filename = title.replace('/', ' ') + '.md'
              var gist = {
                'files': {}
              }
              gist.files[filename] = {
                'content': content
              }
              var gistUrl = 'https://api.github.com/gists'
              request({
                url: gistUrl,
                headers: {
                  'User-Agent': 'HackMD',
                  'Authorization': 'token ' + accessToken
                },
                method: 'POST',
                json: gist
              }, function (error, httpResponse, body) {
                if (!error && httpResponse.statusCode === 201) {
                  res.setHeader('referer', '')
                  res.redirect(body.html_url)
                } else {
                  return response.errorForbidden(res)
                }
              })
            } else {
              return response.errorForbidden(res)
            }
          } else {
            return response.errorForbidden(res)
          }
        })
      }
    }

    function gitlabActions(req, res, next) {
      var noteId = req.params.noteId
      findNote(req, res, function (note) {
        var action = req.params.action
        switch (action) {
          case 'projects':
            gitlabActionProjects(req, res, note)
            break
          default:
            res.redirect(config.serverurl + '/' + noteId)
            break
        }
      })
    }

    function gitlabActionProjects(req, res, note) {
      if (req.isAuthenticated()) {
        models.User.findOne({
          where: {
            id: req.user.id
          }
        }).then(function (user) {
          if (!user) {
            return response.errorNotFound(res)
          }
          var ret = {
            baseURL: config.gitlab.baseURL
          }
          ret.accesstoken = user.accessToken
          ret.profileid = user.profileid
          request(
            config.gitlab.baseURL + '/api/v3/projects?access_token=' + user.accessToken,
            function (error, httpResponse, body) {
              if (!error && httpResponse.statusCode === 200) {
                ret.projects = JSON.parse(body)
                return res.send(ret)
              } else {
                return res.send(ret)
              }
            }
          )
        }).catch(function (err) {
          logger.error('gitlab action projects failed: ' + err)
          return response.errorInternalError(res)
        })
      } else {
        return response.errorForbidden(res)
      }
    }

    function showPublishSlide(req, res, next) {
      var include = [{
        model: models.User,
        as: 'owner'
      }, {
        model: models.User,
        as: 'lastchangeuser'
      }]
      findNote(req, res, function (note) {
        // force to use short id
        var shortid = req.params.shortid
        if ((note.alias && shortid !== note.alias) || (!note.alias && shortid !== note.shortid)) {
          return res.redirect(config.serverurl + '/p/' + (note.alias || note.shortid))
        }
        note.increment('viewcount').then(function (note) {
          if (!note) {
            return response.errorNotFound(res)
          }
          var body = note.content
          var extracted = models.Note.extractMeta(body)
          var markdown = extracted.markdown
          var meta = models.Note.parseMeta(extracted.meta)
          var createtime = note.createdAt
          var updatetime = note.lastchangeAt
          var title = models.Note.decodeTitle(note.title)
          title = models.Note.generateWebTitle(meta.title || title)
          var origin = config.serverurl
          var data = {
            title: title,
            description: meta.description || (markdown ? models.Note.generateDescription(markdown) : null),
            viewcount: note.viewcount,
            createtime: createtime,
            updatetime: updatetime,
            url: origin,
            body: markdown,
            theme: meta.slideOptions && utils.isRevealTheme(meta.slideOptions.theme),
            meta: JSON.stringify(extracted.meta),
            useCDN: config.usecdn,
            owner: note.owner ? note.owner.id : null,
            ownerprofile: note.owner ? models.User.getProfile(note.owner) : null,
            lastchangeuser: note.lastchangeuser ? note.lastchangeuser.id : null,
            lastchangeuserprofile: note.lastchangeuser ? models.User.getProfile(note.lastchangeuser) : null,
            robots: meta.robots || false, // default allow robots
            GA: meta.GA,
            disqus: meta.disqus
          }
          return renderPublishSlide(data, res)
        }).catch(function (err) {
          logger.error(err)
          return response.errorInternalError(res)
        })
      }, include)
    }

    function renderPublishSlide(data, res) {
      res.set({
        'Cache-Control': 'private' // only cache by client
      })
      res.render(config.slidepath, data)
    }

    module.exports = response
