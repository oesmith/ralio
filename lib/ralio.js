var url = require('url'),
    querystring = require('querystring'),
    request = require('request'),
    _ = require('underscore');

function Ralio(username, password) {
  this.username = username;
  this.password = password;
}

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
    strictSSL: true
  };

  request(options, function (error, response, data) {
    callback(error, data);
  });
};

Ralio.prototype.projects = function (callback) {
  this.bulk(
    {
      project: {
        fetch: 'Name',
        order: 'Name',
        pagesize: 100
      }
    },
    function (error, data) {
      if (error !== null) {
        callback(error);
      }
      else {
        callback(null, data.projects.Results);
      }
    }
  )
};

Ralio.prototype.backlog = function (projectName, pagesize, callback) {
  this.bulk(
    {
      hierarchicalrequirement: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND (Iteration = NULL))',
        pagesize: pagesize
      },
      defect: {
        fetch: 'Name,FormattedID,Rank,PlanEstimate',
        order: 'Rank',
        query: '((Project.Name = "' + projectName + '") AND (Iteration = NULL))',
        pagesize: pagesize
      }
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
  var d = this.date();
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
        stories = _.sortBy(stories, function (s) { return s.Rank });
        callback(null, stories);
      }
    }
  );
}

Ralio.prototype.story = function (storyID, callback) {
  var query = {
    fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked,Project,ObjectID',
    query: '(FormattedID = "' + storyID + '")'
  };
  var type = storyID.slice(0, 2);
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
    else if (type == 'US') {
      callback(null, data.hierarchicalrequirement.Results[0] || null);
    }
    else {
      callback(null, data.defect.Results[0] || null);
    }
  });
};

module.exports = Ralio;

