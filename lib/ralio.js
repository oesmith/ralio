var url = require('url'),
    querystring = require('querystring'),
    request = require('request'),
    _ = require('underscore');

function Ralio(username, password) {
  this.username = username;
  this.password = password;
}

Ralio.test = false;

Ralio.prototype.bulkUrl = function () {
  return url.format({
    protocol: 'https',
    auth: this.username + ':' + this.password,
    hostname: 'rally1.rallydev.com',
    pathname: '/slm/webservice/1.36/adhoc.js'
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

  request(options, function (error, response, data) {
    if (error !== null) {
      callback(error);
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
      type = storyID.slice(0,2),
      query = {
        fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked,Project,ObjectID,Description',
        query: '(FormattedID = "' + storyID + '")'
      };
  if (type == 'US') {
    query = {hierarchicalrequirement: query};
  }
  else {
    query = {defect: query};
  }
  this.bulk(query, function (error, data) {
    if (error !== null) {
      callback(error);
    }
    else {
      if (type == 'US') {
        var story = data.hierarchicalrequirement.Results[0];
      }
      else {
        var story = data.defect.Results[0];
      }
      if (story !== null) {
        story.Tasks = self.orderTasks(story.Tasks);
      }
      callback(null, story);
    }
  });
};

Ralio.prototype.setTaskState = function (taskID, state, setOwner, callback) {
  var self = this;
  this.bulk({
    user: {},
    task: {query: '(FormattedID = "' + taskID + '")'}
  }, function (error, data) {
    if (error !== null) {
      callback(error);
    }
    else {
      var user = data.user;
      var task = data.task.Results[0];
      var update = {
        Task: {
          _ref: task._ref,
          State: state,
        }
      };
      if (setOwner) {
        update.Task.Owner = user._ref;
      }
      else {
        update.Task.Owner = null;
      }
      if (state === 'Completed') {
        update.Task.ToDo = 0.0;
      }
      self.update(task._ref, update, function (error) {
        if (error) {
          callback(error);
        }
        else {
          self.bulk({
            task: {
              fetch: true,
              query: '(FormattedID = "' + taskID + '")'
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

