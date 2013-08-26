var url = require('url'),
    querystring = require('querystring'),
    request = require('request'),
    _ = require('underscore'),
    temp = require('temp'),
    editor = require('editor'),
    package = require('../package.json'),
    fs = require('fs');

function Ralio(hostname, username, password, project, team) {
  this.hostname = hostname;
  this.username = username;
  this.password = password;
  this.project = project;
  this.team = team;
  this._editor = editor; //needed for testability - the editor module exports a raw function and not an object so there's no direct way to stub it out.  :/
}

Ralio.test = false;

Ralio.prototype.prefixes = function (workspaceId) {
  // Hard coded for now - we should load these from WSAPI because they're configurable per workspace
  return {
    'US': 'hierarchicalrequirement',
    'S' : 'hierarchicalrequirement',
    'TA': 'task',
    'DE': 'defect'
  };
}

Ralio.prototype.prefixOf = function (formattedID) {
  return formattedID.match(/^[^0-9]+/)[0].toUpperCase();
}

Ralio.prototype.rallyWsapiUrl = function (type, query, options) {
  var rally_url = url.parse(this.hostname);

  options = options || {};
  query = query || {};
  return url.format({
    protocol: rally_url.protocol,
    auth: this.username + ':' + this.password,
    hostname: rally_url.hostname,
    port: rally_url.port,
    pathname: options.pathname ? options.pathname : '/slm/webservice/1.42/' + type + '.js',
    query: query
  });
}

Ralio.prototype.bulkUrl = function (options) {
  return this.rallyWsapiUrl('adhoc', {}, options);
};

Ralio.prototype.artifactUrl = function (formattedID, query) {
  var type = this.prefixes()[this.prefixOf(formattedID)];
  return this.rallyWsapiUrl(type, query);
};

Ralio.prototype.typedefUrl = function (query) {
  return this.rallyWsapiUrl('typedefinition', query);
};

Ralio.prototype.rallyWsapiRequest = function (options) {
  return _.extend({
    method: 'GET',
    json: {},
    strictSSL: !Ralio.test
    }, options);
}

Ralio.prototype.domainObject = function (displayName, url, callback) {
  var self = this;
  var req = this.rallyWsapiRequest({url: url});

  this.request(req, function (err, results){
    if (err !== null) {
      callback(err);
    } else if (results.QueryResult.TotalResultCount > 1) {
      callback('Query for single object [' + displayName + '] returned multiple results.  Errors: ' + results.QueryResult.Errors);
    } else if (results.QueryResult.TotalResultCount == 0) {
      callback(displayName + ' not found.  Errors: ' + results.QueryResult.Errors);
    } else {
      var result = results.QueryResult.Results[0];
      result._QueryResult = results.QueryResult;
      callback(err, result);
    }
  });
}

Ralio.prototype.typedef = function (type, query, callback) {
  query = _.extend({
    query: "(TypePath = \"" + type + "\")",
    fetch: true,
    pagesize: 1,
    }, query);

  var url = this.typedefUrl(query);
  this.domainObject('TypeDef [' + type + ']', url, callback);
}

Ralio.prototype.artifact = function (formattedID, query, opts, callback) {
  var self = this;
  query = _.extend({
    query: "(FormattedID = " + formattedID + ")",
    fetch: "FormattedID",
    typeDefinition: false,
    pagesize: 1
    }, query);

  opts = _.extend({
    typeDefinition: false
    }, opts);

  var url = this.artifactUrl(formattedID, query);

  this.domainObject(formattedID, url, function (err, result){
    if (err !== null) {
      callback(err);
    } else {
      if (opts.typeDefinition) {
        self.typedef(result._type, {}, function(err, typedef) {
          result._typeDefinition = typedef;

          callback(err, result);
        });
      } else {
        callback(err, result);
      }
    }
  });
}

Ralio.prototype.date = function () {
  return new Date().toISOString().slice(0, 10);
}

Ralio.prototype.bulk = function (query, callback) {
  var data = {};
  for (var key in query) {
    if (query.hasOwnProperty(key)) {
      if (typeof query[key] === 'object') {
        data[key] = '/' + key + '?' + querystring.stringify(query[key]);
      } else {
        data[key] = query[key];
      }
    }
  }

  var options = {
    url: this.bulkUrl(),
    method: 'POST',
    json: data,
    strictSSL: !Ralio.test
  };

  this.request(options, callback);
};

Ralio.prototype.comments = function (itemID, callback) {
  var self = this,
      query = {
        fetch: 'PostNumber,Text,User',
        query: '(Artifact.FormattedID = "' + itemID + '")'
      },
      ret = {};

  self.artifact(itemID, {
    fetch: 'FormattedID,Name,Owner,Project,Discussion'
  }, {}, function(error, item) {
    if (error !== null) {
      callback(error);
    } else {
      ret.artifact = item;
      self.bulk({
        conversationpost: query
      }, function (error, data) {
        if (error !== null) {
          callback(error);
        } else {
          var posts = data.conversationpost.Results;
          posts = _.sortBy(posts, function (s) { return s.PostNumber });
          ret.comments = posts;
          callback(null, ret);
        }
      });
    }
  });
};

Ralio.prototype.addComment = function (itemID, text, callback) {
  var self = this,
      options = {
        url: self.bulkUrl({"pathname":"/slm/webservice/1.36/conversationpost/create.js"}),
        method: 'POST',
        json: {"ConversationPost":{
          "Text": text
        }},
        strictSSL: !Ralio.test
      };

  self.artifact(itemID, {
    fetch: 'FormattedID,Name,Owner,Project,Discussion'
  }, {}, function(error, item) {
    if (error !== null) {
      callback(error);
    } else {
      options.json.ConversationPost.Artifact = item._ref;
      options.json.ConversationPost.PostNumber = item.Discussion.length;
      self.request(options, function(error, data){
        if (error !== null) {
          callback(error);
        } else if (data.CreateResult && data.CreateResult['Object']) {
          callback(null, data.CreateResult['Object']);
        } else {
          callback("Failed to create a new discussion post.", data);
        }
      });
    }
  });
};

Ralio.prototype.time = function(taskID, hours, callback) {
  var self = this,
      type = taskID.slice(0,2).toUpperCase(),
      query = {
        fetch: 'Project,WorkProduct',
        query: '((Project.Name = "' + this.project + '") AND (FormattedID = "' + taskID + '"))'
      };

  if (type === "TA") {
    query = {task: query};
  } else {
    callback("Ralio can only put timesheet entries against a task (TA).");
  }

  var addTEV = function (project, item, hours) {
    var date = new Date();
    date.setUTCHours(0,0,0,0);
    date = date.toISOString();
    self.bulk({
      timeentryvalue: {
        fetch: 'Hours',
        query: '((TimeEntryItem.Task.FormattedID = "' + taskID + '") AND (DateVal = "' + date + '"))'
      }
    }, function (error, data) {
      if (error !== null) {
        callback(error);
      } else {
        var value = data.timeentryvalue.Results;
        if (value.length) {
          self.update(value[0]._ref, {
            TimeEntryValue: {
              Hours: value[0].Hours + hours
            }
          }, function (error) {
            if (error) {
              callback(error);
            } else {
              callback(null, {
                Hours: value[0].Hours + hours
              });
            }
          });
        } else {
          var options = {
            url: self.bulkUrl({"pathname":"/slm/webservice/1.36/timeentryvalue/create.js"}),
            method: 'POST',
            json: {"TimeEntryValue":{
              "Project": project,
              "TimeEntryItem": item,
              "DateVal": date,
              "Hours": hours
            }},
            strictSSL: !Ralio.test
          };
          self.request(options, function(error, data){
            if (error !== null) {
              callback(error);
            } else if (data.CreateResult && data.CreateResult['Object']) {
              callback(null, data.CreateResult['Object']);
            } else {
              callback("Failed to create a time entry.", data);
            }
          });
        }
      }
    });
  }

  this.bulk(query, function (error, data) {
    if (error !== null) {
      callback(error);
    } else {
      var task = data.task.Results;
      if (!task.length) {
        callback("No task found with that ID.");
      } else {
        var project = task[0].Project._ref,
            story   = task[0].WorkProduct._ref,
            taskRef = task[0]._ref;

        self.bulk({
          timeentryitem: {
            fetch: 'WeekStartDate',
            query: '(Task.FormattedID = "' + taskID + '")'
          }
        }, function (error, data) {
          if (error !== null) {
            callback(error);
          } else {
            var item = data.timeentryitem.Results;
            if (item.length) {
              addTEV(project, item[0]._ref, hours);
            } else {
              var itemCreation = setInterval(function() {
                var weekstart = new Date();
                do {
                  weekstart.setDate(weekstart.getDate() - 1);
                } while (weekstart.getDay());
                var options = {
                  url: self.bulkUrl({"pathname":"/slm/webservice/1.36/timeentryitem/create.js"}),
                  method: 'POST',
                  json: {"TimeEntryItem":{
                    "Project": project,
                    "WorkProduct": story,
                    "Task": taskRef,
                    "WeekStartDate": weekstart.toISOString()
                  }},
                  strictSSL: !Ralio.test
                };
                self.request(options, function(error, data) {
                  if (error !== null) {
                    callback(error);
                  } else {
                    addTEV(project, data.CreateResult['Object']._ref, hours);
                  }
                });
                clearInterval(itemCreation);
              }, 300);
            }
          }
        });
      }
    }
  });
}

Ralio.prototype.headers =  function (headers) {
  return _.defaults(headers || {}, {
    "X-RallyIntegrationLibrary": "Node.js Native",
    "X-RallyIntegrationName": package.name,
    "X-RallyIntegrationVendor": package.repository.url,
    "X-RallyIntegrationVersion": package.version,
    "User-Agent": "Node.JS (request:" + package.dependencies.request + ")"
  });
}

Ralio.prototype.request = function(options, callback) {
  options.headers = this.headers(options.headers);

  request(options, function (error, response, data) {
    if (error !== null) {
      callback(error);
    } else if (response.statusCode === 401) {
      var error = "Authentication failed! Check your ~/.raliorc file!";
      callback(Ralio.test ? error : error.red);
    } else if (response.statusCode !== 200) {
      callback(response.body);
    } else {
      callback(null, data);
    }
  });
};

Ralio.prototype.updateArtifact = function (artifact, updates, callback) {
  var up={};
  up[artifact._type] = updates;
  this.update(artifact._ref, up, callback);
}

Ralio.prototype.update = function (ref, changes, callback) {
  ref = url.parse(ref);
  ref.auth = this.username + ':' + this.password;
  ref = url.format(ref);

  var options = {
    url: ref,
    method: 'POST',
    headers: this.headers(),
    json: changes,
    strictSSL: !Ralio.test
  };

  request(options, function (error, response, data) {
    if (error !== null) {
      callback(error);
    } else if (response.statusCode !== 200) {
      callback(response.body);
    } else if (response.body.OperationResult.Errors.length > 0) {
      callback(response.body.OperationResult.Errors);
    } else {
      callback(null);
    }
  });
};

Ralio.prototype.backlog = function (options, callback) {
  var defaults = {
    projectName: null,
    pagesize: 100,
    tag: null
  };
  options = _.extend({}, defaults, options);
  var query = {
    fetch: 'Name,FormattedID,Rank,PlanEstimate,Tags',
    order: 'Rank',
    query: (options.tag ?
      '((Project.Name = "' + options.projectName + '") AND ((Iteration = NULL) AND (Tags.Name = "' + options.tag + '")))' :
      '((Project.Name = "' + options.projectName + '") AND (Iteration = NULL))'),
    pagesize: options.pagesize
  };
  this.bulk(
    {
      hierarchicalrequirement: query,
      defect: query
    },
    function (error, data) {
      if (error !== null) {
        callback(error);
      } else {
        var stories = data.hierarchicalrequirement.Results.concat(data.defect.Results);
        stories = _.sortBy(stories, function (s) { return s.Rank });
        callback(null, stories);
      }
    }
  );
};

Ralio.prototype.sprint = function (projectName, options, callback) {

  // How to build Rally's queries.
  // 1 Filter: (Project.Name = "Hokage")
  // 2 Filters: ((Project.Name = "Hokage") AND (Iteration.StartDate <= "2013-03-07"))
  // 3 Filters: ((Project.Name = "Hokage") AND ((Iteration.StartDate <= "2013-03-07") AND (Iteration.EndDate >= "2013-03-07")))
  // 4 Filters: ((Project.Name = "Hokage") AND ((Iteration.StartDate <= "2013-03-07") AND ((Iteration.EndDate >= "2013-03-07") AND (Project.Name = "Hokage"))))

  var self = this,
      d = this.date(),
      fetch = 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,Tags,Pair,Defects,State,Owner,TaskIndex,Blocked',
      query_string = '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))';

  if(options.find && options.find !== true)
    query_string = '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND ((Iteration.EndDate >= "' + d + '") AND (Name contains "'+ options.find + '"))))';

  var query = {
    fetch: fetch,
    order: 'Rank',
    query: query_string,
    pagesize: 100
  };

  this.bulk(
    {hierarchicalrequirement: query, defect: query},
    function (error, data) {
      if (error !== null) {
        callback(error);
      } else {
        var stories = data.hierarchicalrequirement.Results.concat(data.defect.Results);
        callback(null, self.orderStories(stories));
      }
    }
  );
}

Ralio.prototype.story = function (storyID, callback) {
  var self = this,
      type = storyID.slice(0,2).toUpperCase(),
      query = {
        fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,Tags,Pair,Defects,State,Owner,TaskIndex,Blocked,Project,ObjectID,Description',
        query: '(FormattedID = "' + storyID + '")'
      };

  if (type === 'US') {
    query = {hierarchicalrequirement: query};
  } else if (type === "DE") {
    query = {defect: query};
  } else if (type === "TA") {
    query = {task: query};
  } else {
    callback("Ralio's can only show detailed information of a defect(DE), story(US) or tasks(TA).");
  }

  this.bulk(query, function (error, data) {
    if (error !== null) {
      callback(error);
    } else {
      var data = data.hierarchicalrequirement || data.defect || data.task;

      if(data.TotalResultCount === 0){
        callback(storyID + " Not Found!")
      }

      var story = data.Results[0];

      if (story !== null) {
        story.Tasks = self.orderTasks(story.Defects ? story.Tasks.concat(story.Defects) : story.Tasks);
      }

      callback(null, story);
    }
  });
};

Ralio.prototype.setTaskState = function (task_id, options, callback) {
  options = options || {};
  var self = this,
      type = task_id.slice(0,2).toUpperCase(),
      query = {
        fetch: true,
        query: '(FormattedID = "' + task_id + '")'
      };

  if (type === "DE") {
    query = {defect: query, user: {}};
  } else if (type === "TA") {
    query = {task: query, user: {}};
  } else if (type === "US") {
    query = {hierarchicalrequirement: query, user: {}};
  } else {
    callback("You can only start a Task (TA) or a Defect (DE)");
  }

  this.bulk(query, function (error, data) {
    if (error !== null) {
      callback(error);
    } else {
      var user = data.user,
          data =  data.defect || data.task || data.hierarchicalrequirement,
          task = null;

      if(data.TotalResultCount === 0)
        callback(task_id + " Not Found!")

      if (type === "DE") {
        task = data.Results[0];

        var update = {
          Defect: {
            _ref: task._ref,
          }
        },
        taskObject = update.Defect;

      } else if (type === "TA") {
        task = data.Results[0];

        var update = {
          Task: {
            _ref: task._ref,
          }
        },
        taskObject = update.Task;
      } else if (type === "US") {
        task = data.Results[0];

        var update = {
          HierarchicalRequirement: {
            _ref: task._ref,
          }
        },
        taskObject = update.HierarchicalRequirement;
      }

      if (typeof options.pair === "string") {
        taskObject.Pair = options.pair
      } else if (options.pair === true){
        taskObject.Pair = '';
      }

      if (options.state) {

        if (type === "US" || type === "DE") {
          taskObject.ScheduleState = options.state;
        } else {
          taskObject.State = options.state;
        }

        if (options.state === "In-Progress" || options.state === "Defined") {
          taskObject.ToDo = 1.0;
          taskObject.Estimate = taskObject.ToDo;

          if (type === "DE") {
            taskObject.State = "Open";
          }
        }

        if (options.state === 'Completed') {
          taskObject.ToDo = 0.0;

          if (type === "DE") {
            taskObject.State = "Fixed";
          }

        }
      }

      if (options.blocked !== undefined) {
        taskObject.Blocked = options.blocked;
      }

      taskObject.Owner = options.own ? user._ref : null;

      if (options.rootcause !== undefined) {
        taskObject.RootCause = options.rootcause;
      }

      if (options.resolution !== undefined) {
        taskObject.Resolution = options.resolution;
      }

      self.update(task._ref, update, function (error) {
        if (error) {
          callback(error.join('\n\n'));
        } else {
          self.bulk(query, function (error, data) {
            if (error) {
              callback(error);
            } else {
              data = data.defect || data.task || data.hierarchicalrequirement;
              callback(null, data.Results[0]);
            }
          });
        }
      });
    }
  });
}

Ralio.prototype.current = function (projectName, callback) {
  var self = this, d = this.date();
  this.bulk(
    {
      user: {},
      hierarchicalrequirement: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,Tags,Pair,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      },
      defect: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,Tags,Pair,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      }
    },
    function (error, data) {
      if (error !== null) {
        callback(error);
      } else {
        var user = data.user,
            stories = data.hierarchicalrequirement.Results,
            defects = data.defect.Results;

        stories = _.filter(stories, function (story) {
          return _.any(story.Tasks, function (task) {
            return task.Owner !== null && task.State === 'In-Progress' && task.Owner._ref == user._ref;
          });
        });

        defects = _.filter(defects, function (defect) {
            return defect.Owner !== null && defect.State === 'Open' && defect.Owner._ref == user._ref;
        });

        callback(null, self.orderStories(stories.concat(defects)));
      }
    }
  );
}

Ralio.prototype.point = function (storyID, points, callback) {
  var self = this,
      type = storyID.slice(0,2).toUpperCase(),
      query = {
        fetch: true,
        query: '(FormattedID = "' + storyID + '")'
      };

  if (type === "DE") {
    query = {defect: query, user: {}};
  } else if (type === "US") {
    query = {hierarchicalrequirement: query, user: {}};
  } else {
    callback("You can only point a Defect (DE) or a Story (US)");
  }

  self.bulk(query, function (error, data) {

    if (error !== null) {
      callback(error);
    } else {

      var update = {},
          data = data.hierarchicalrequirement || data.defect;

      if(data.TotalResultCount === 0)
        callback(storyID + " Not Found!")

      var task = data.Results[0];
      if (type === "US") {
        update.HierarchicalRequirement = {
          _ref: task._ref,
          PlanEstimate: points
        };
      } else if (type === "DE") {
        update.Defect = {
          _ref: task._ref,
          PlanEstimate: points
        };
      }

      self.update(task._ref, update, function (error) {
        if (error) {
          callback(error);
        } else {

          self.bulk(query, function (error, data) {
            if (error) {
              callback(error);
            } else {
              callback(null, (data.hierarchicalrequirement || data.defect).Results[0]);
            }
          });

        }
      });
    }
  });
};

Ralio.prototype.createTask = function (projectName, storyID, taskName, tags, callback) {
  var self = this,
      tagsObject  = [];

  self.getTags(tags, function (error, data) {
    if (error){
      callback(error)
    } else {
      if (typeof data._ref !== "undefined")
        tagsObject.push({_ref: data._ref});
    }
  });

  var taskCreation = setInterval(function() {
    if (tagsObject.length === tags.length || Ralio.test) {
      self.story(storyID, function(error, data) {
        if (error)
          callback(error)

        var story = data._ref,
            project = data.Project._ref,
            new_task = {"Task":{
                "Name": taskName,
                "Project": project,
                "WorkProduct": story,
                "ToDo": 1.0,
                "Estimate": 1.0,
                "Tags": tagsObject
              }
            };

        var options = {
          url: self.bulkUrl({"pathname":"/slm/webservice/1.42/task/create.js"}),
          method: 'POST',
          json: new_task,
          strictSSL: !Ralio.test
        };

        self.request(options, function(error, data){
          callback(null, null, data.CreateResult.Object, taskName);
        });
      });
      clearInterval(taskCreation);
    }
  }, 300);
};

Ralio.prototype.deleteTask = function (projectName, storyID, callback) {
  var self = this;

  self.getTask(storyID, function(error, task) {
    if (error || typeof task !== "object")
      return callback(error);

    var deletePath = url.parse(task._ref).pathname;

    var options = {
          url: self.bulkUrl({"pathname": deletePath}),
          method: 'DELETE',
          json: {},
          strictSSL: !Ralio.test
        };

    self.request(options, function(error, data) {
      var message = Ralio.test ? storyID + " deleted" : storyID.yellow + " deleted".green;
      callback(message);
    });
  });
};

Ralio.prototype.task = function (option, projectName, storyID, taskName, tags, callback) {
  switch(option){
    case "create": this.createTask(projectName, storyID, taskName, tags, callback); break;
    case "delete": this.deleteTask(projectName, storyID, callback); break;
    default: callback("Unknown option " + option); break;
  }
};

Ralio.prototype.getTag = function (tag, callback) {
  this.bulk({
      tag: {
        fetch: true,
        query: '(Name = "' + tag + '")'
      }
    }, function (error, data) {
      error = data.tag.TotalResultCount === 0 ? 'Tag ' + tag + ' Not Found!' : null;
      if (error) {
        callback(error);
      } else {
        callback(null, data.tag.Results[0]);
      }
    });
};

Ralio.prototype.getTags = function (tags, callback) {
  tags = (typeof tags === "object") ? tags : tags.split(',');
  for (i in tags) {
    this.getTag(tags[i], function(error, data){
      if(error){
        callback(error);
      } else {
        callback(null, data);
      }
    });
  }
};

Ralio.prototype.getTask = function (taskID, callback){
  this.bulk({
    user: {},
    task: {query: '(FormattedID = "' + taskID + '")'}
  }, function(error, data){
    if(data.task.TotalResultCount === 0) {
      var error = "Task Not Found!";
      callback(Ralio.test ? error : error.red, null);
    } else {
      callback(null, data.task.Results[0]);
    }
  })
};

Ralio.prototype.orderStories = function (stories) {
  stories = _.sortBy(stories, function (s) { return s.Rank });
  for (var i = 0; i < stories.length; i++) {
    stories[i].Tasks = this.orderTasks(stories[i].Tasks);
  }
  return stories;
}

Ralio.prototype.orderTasks = function (tasks) {
 return _.sortBy(tasks, function (t) { return t.TaskIndex });
}

Ralio.prototype.editor = function (contents, opts, callback) {
  opts = opts || {};
  var suffix = opts.suffix || '.txt';
  var self = this;

  var tmp_file = temp.open({suffix: suffix}, function (err, tmp_file) {
    fs.write(tmp_file.fd, contents);
    fs.close(tmp_file.fd, function(err) {
      if (err && (typeof callback == 'function')) {
        callback({success: false, err: err});
        return;
      }

      self._editor(tmp_file.path, function (code, sig) {
        if (0 == code) {
          if (typeof callback == 'function') {
            var new_contents = fs.readFileSync(tmp_file.path).toString().trimRight();
            callback ({
              success: true,
              value: new_contents,
              editor: {
                exit_code: code,
                exit_signal: sig
              }});
          }
        } else {
          if (typeof callback == 'function') {
            callback ({
              success: false,
              editor: {
                exit_code: code,
                exit_signal: sig
              }});
          }
        }
      }); // editor(tmp_file.path)
    }); //fs.close(tmp_file.fd)
  }); // temp.open()

}

module.exports = Ralio;