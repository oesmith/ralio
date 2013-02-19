var url = require('url'),
    querystring = require('querystring'),
    request = require('request'),
    _ = require('underscore');

function Ralio(username, password, project, team) {
  this.username = username;
  this.password = password;
  this.project = project;
  this.team = team;
}

Ralio.test = false;

Ralio.prototype.bulkUrl = function (options) {
  options = options || {};
  return url.format({
    protocol: options.protocol ? options.protocol : 'https',
    auth: this.username + ':' + this.password,
    hostname: 'rally1.rallydev.com',
    pathname: options.pathname ? options.pathname : '/slm/webservice/1.36/adhoc.js'
  });
};

Ralio.prototype.date = function () {
  return new Date().toISOString().slice(0, 10);
}

Ralio.prototype.bulk = function (query, callback) {
  var data = {};
  for (var key in query) {
    if (query.hasOwnProperty(key)) {
      if (typeof query[key] === 'object') {
        data[key] = '/' + key + '?' + querystring.stringify(query[key]);
      }
      else {
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

Ralio.prototype.request = function(options, callback) {
  request(options, function (error, response, data) {
    if (error !== null) {
      callback(error);
    }
    else if (response.statusCode === 401) {
      var error = "Authentication failed! Check your ~/.raliorc file!";
      callback(Ralio.test ? error : error.red);
    }
    else if (response.statusCode !== 200) {
      callback(response.body);
    }
    else {
      callback(null, data);
    }
  });
};

Ralio.prototype.update = function (ref, changes, callback) {
  ref = url.parse(ref);
  ref.auth = this.username + ':' + this.password;
  ref = url.format(ref);

  var options = {
    url: ref,
    method: 'POST',
    json: changes,
    strictSSL: !Ralio.test
  };

  request(options, function (error, response, data) {
    if (error !== null) {
      callback(error);
    }
    else if (response.statusCode !== 200) {
      callback(response.body);
    }
    else if (response.body.OperationResult.Errors.length > 0) {
      callback(response.body.OperationResult.Errors);
    }
    else {
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
      }
      else {
        var stories = data.hierarchicalrequirement.Results.concat(data.defect.Results);
        stories = _.sortBy(stories, function (s) { return s.Rank });
        callback(null, stories);
      }
    }
  );
};

Ralio.prototype.sprint = function (projectName, callback) {
  var self = this, d = this.date();
  this.bulk(
    {
      hierarchicalrequirement: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      },
      defect: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      }
    },
    function (error, data) {
      if (error !== null) {
        callback(error);
      }
      else {
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
        fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked,Project,ObjectID,Description',
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
      if(data.TotalResultCount === 0)
          callback(storyID + " Not Found!")

      if (type === 'US' || type === "DE" || type === "TA") {
        var story = data.Results[0];
      }

      if (story !== null) {
        story.Tasks = self.orderTasks(story.Tasks);
      }
      callback(null, story);
    }
  });
};

Ralio.prototype.setTaskState = function (task_id, options, callback) {
  options = options || {};
  var self = this;
  this.bulk({
    user: {},
    task: {query: '(FormattedID = "' + task_id + '")'}
  }, function (error, data) {
    if (error !== null) {
      callback(error);
    }
    else {
      
      var user = data.user,
          task = data.task.Results[0];

      if (data.task.TotalResultCount === 0){
        var error = "Task Not Found!";
        callback(Ralio.test ? error : error.red);
      }
      
      var update = {
        Task: {
          _ref: task._ref,
        }
      };
      if (options.state) {
        update.Task.State = options.state;
        if (options.state === 'Completed') {
          update.Task.ToDo = 0.0;
        }
      }
      if (options.blocked !== undefined) {
        update.Task.Blocked = options.blocked;
      }
      if (options.own) {
        update.Task.Owner = user._ref;
      }
      else {
        update.Task.Owner = null;
      }
      if (options.remaining !== undefined) {
        update.Task.ToDo = options.remaining;
      }
      self.update(task._ref, update, function (error) {
        if (error) {
          callback(error);
        }
        else {
          self.bulk({
            task: {
              fetch: true,
              query: '(FormattedID = "' + task_id + '")'
            }
          }, function (error, data) {
            if (error) {
              callback(error);
            }
            else {
              callback(null, data.task.Results[0]);
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
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      },
      defect: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND ((Iteration.StartDate <= "' + d + '") AND (Iteration.EndDate >= "' + d + '")))',
        pagesize: 100
      }
    },
    function (error, data) {
      if (error !== null) {
        callback(error);
      }
      else {
        var user = data.user;
        var stories = data.hierarchicalrequirement.Results.concat(data.defect.Results);
        stories = _.filter(stories, function (story) {
          return _.any(story.Tasks, function (task) {
            return task.Owner !== null &&
              task.State == 'In-Progress' &&
              task.Owner._ref == user._ref;
          });
        });
        callback(null, self.orderStories(stories));
      }
    }
  );
}

Ralio.prototype.point = function (storyID, points, callback) {
  var self = this;
  var query = {query: '(FormattedID = "' + storyID + '")'};
  this.bulk({defect: query, hierarchicalrequirement: query}, function (error, data) {
    if (error !== null) {
      callback(error);
    }
    else {
      var update = {},
          hierarchicalrequirement = data.hierarchicalrequirement.Results[0],
          defect = data.defect.Results[0];
      if (hierarchicalrequirement !== undefined) {
        update.HierarchicalRequirement = {
          _ref: hierarchicalrequirement._ref,
          PlanEstimate: points
        };
      }
      else if (defect !== undefined) {
        update.Defect = {
          _ref: defect._ref,
          PlanEstimate: points
        };
      }
      var ref = (hierarchicalrequirement !== undefined ? hierarchicalrequirement._ref : defect._ref);
      self.update(ref, update, function (error) {
        if (error) {
          callback(error);
        }
        else {
          query.fetch = true;
          var handler = function (error, data) {
            if (error) {
              callback(error);
            }
            else {
              if (hierarchicalrequirement !== undefined) {
                callback(null, data.hierarchicalrequirement.Results[0]);
              }
              else {
                callback(null, data.defect.Results[0]);
              }
            }
          };
          if (hierarchicalrequirement !== undefined) {
            self.bulk({ hierarchicalrequirement: query }, handler);
          }
          else {
            self.bulk({ defect: query }, handler);
          }
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
      self.story(storyID, function(error, data){
        var story = data._ref,
            project = data.Project._ref,
            new_task = {"Task":{
                "Name": taskName, 
                "Project": project,
                "WorkProduct": story,
                "Tags": tagsObject
              }
            };

        var options = {
          url: self.bulkUrl({"pathname":"/slm/webservice/1.36/task/create.js"}),
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
    if (typeof task !== "object") 
      callback(task);

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

module.exports = Ralio;