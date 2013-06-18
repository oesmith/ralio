var path = require('path'),
    fs = require('fs'),
    child_process = require('child_process'),
    temp = require('temp'),
    colors = require('colors'),
    _ = require('underscore'),
    html = require("html"),
    Ralio = require('./ralio');

function CLI(hostname) {
  this.hostname = hostname || 'https://rally1.rallydev.com/';
  this.configure();
  this.ralio = new Ralio(this.hostname, this.config.username, this.config.password, this.config.project, this.config.team);
}

CLI.prototype.configure = function () {
  var config_path = path.join(process.env.HOME, '.raliorc');
  
  try {
    this.config = JSON.parse(fs.readFileSync(config_path));  
  } catch (e){
    console.log('~/.raliorc doesn\'t exist!'.red)
    process.kill();
  }

  var quickIDs_path = path.join(process.env.HOME, '.ralio_recent');
  if (fs.existsSync(quickIDs_path)) {
    this.quickIDs = JSON.parse(fs.readFileSync(quickIDs_path));
  }
};

CLI.prototype.backlog = function (options) {
  var self = this, 
      team = this.config.team,
      project = options.project || this.config.project,
      projectName = project || team,
      opts = {
        projectName: project || team,
        pagesize: options.all ? 100 : 20,
        tag: options.tag
      };
  this.ralio.backlog(opts, function (error, stories) {
    self.errors(error);
    if (!options.all) {
      stories = stories.slice(0, 20);
    }
    stories.forEach(function (story) {
      self.printStoryLine(story, {state: false, tags: true});
    });
    self.saveQuickIDs();
  });
};

CLI.prototype.sprint = function (options) {
  var self = this,
      team = options.group || this.config.team,
      project = options.project || this.config.project,
      projectName = project || team;
  this.ralio.sprint(projectName, options, function (error, stories) {
    self.errors(error);
    stories.forEach(function (story) {
      if (story.ScheduleState != 'Accepted' || options.accepted) {
        var tasks = _.extend(story.Tasks, story.Defects)
        if(tasks.length > 0){
          self.printStoryLine(story, {owners: !options.tasks});
          if (options.tasks) {
            tasks.forEach(function (task) {
              self.printTaskLine(task);
            });
          }
        } else {
          self.printTaskLine(story, {tab: false, points: true});
        }
      }
    });
    self.saveQuickIDs();
  });
};

CLI.prototype.current = function () {
  var self = this;
  this.ralio.current(this.config.team, function (error, stories) {
    self.errors(error);
    stories.forEach(function (story) {
      self.printStoryLine(story);
      story.Tasks.forEach(function (task) {
        self.printTaskLine(task);
      });
    });
    self.saveQuickIDs();
  });
};

CLI.prototype.preFormatHtml = function(html_in) {
  var formatted = html.prettyPrint(html_in, {indent_size: 2});
  return formatted;
};

CLI.prototype.ATTRIBUTE_OPTIONS = {
  supported: [
    {type: "STRING", suffix: '.txt'},
    {type: "BOOLEAN", suffix: '.txt'},
    {type: "INTEGER", suffix: '.txt'},
    {type: "TEXT", suffix: '.html', preformat: CLI.prototype.preFormatHtml}
    ],

  forType: function (type) {
    return _.find(this.supported, function(ok_type){return ok_type.type == type});
  }
};

CLI.prototype.edit = function (formattedID, field) {
  var self = this;

  this.ralio.artifact(formattedID, {fetch: field}, {typeDefinition: true}, function (err, artifact) {
    self.errors(err);

    if (typeof artifact[field] === 'undefined') {
      err = 'Field ' + field + ' not found.';
    }
    
    return self.errors(err);

    var fieldType = _.find(artifact._typeDefinition.Attributes, function(attr){
      return attr.ElementName == field 
    }).AttributeType;

    var fieldOpts = self.ATTRIBUTE_OPTIONS.forType(fieldType);
    if (typeof fieldOpts === 'undefined') {
      err = 'Field ' + field + ' is not a type suported by this tool. [' + fieldType + ']';
    }
    var suffix = fieldOpts.suffix || '.txt';

    self.errors(err);

    var old_value = artifact[field];

    if (typeof fieldOpts.preformat === 'function') {
      old_value = fieldOpts.preformat(old_value);
    }

    self.ralio.editor(old_value, {suffix: suffix}, function (result) {
      if (false == result.success) {
        console.error(('EDITOR returned error.  Exit code: ' +  result.editor.exit_code + ', Exit signal: ' + result.editor.exit_signal).red);
        return;
      }

      if (old_value !== result.value) {
        var updates = {};
        updates[field] = result.value;

        self.ralio.updateArtifact(artifact, updates, function (err) {
          if (err !== null){
            console.error(('Error updating ' + formattedID + '.  Err: ' + err).red);
          }
        });
      }
    });
  });
};


CLI.prototype.show = function (story) {
  var self = this;
  this.ralio.story(this.fetchID(story), function (error, story) {
    self.errors(error);
    if (story === null) {
      console.error('No story found :('.red);
    }
    else {
      var descTempPath = temp.path({suffix: '.html'});
      fs.writeFileSync(descTempPath, story.Description);
      child_process.exec('elinks -dump ' + descTempPath, function (err, stdout, stderr) {
        
        if (err) {
          var description =
            '  There was an error formatting the description text :(\n'.red +
            '  Is elinks installed?  (hint: brew install elinks or sudo apt-get install elinks).'.red;
        } else {
          var description = stdout.replace(/^\n+/, '').replace(/\n+$/g, '');
        }

        fs.unlinkSync(descTempPath);

        (story.Tasks.length > 0) ? 
          self.printStoryLine(story) : self.printTaskLine(story, {tab: false, points: true});

        if (description != '') {
          console.log('\n' + description + '\n');
        }

        story.Tasks.forEach(function (task) {
          self.printTaskLine(task);
        });

        self.saveQuickIDs();
      });
    }
  });
};

CLI.prototype.open = function (story) {
  var self = this,
      openCommand = process.platform === "linux" ? "xdg-open" : "open"
  this.ralio.story(this.fetchID(story), function (error, story) {
    self.errors(error ? error.red : error);
    if (story === null) {
      console.error('No story found :('.red);
    } else {
      var story_type = null;
      switch (story._type) {
        case 'Defect': story_type = 'defect'; break;
        case 'HierarchicalRequirement': story_type = 'userstory'; break;
        case 'Task': story_type = 'task'; break;
      }
      child_process.exec(
        openCommand + ' ' +
        self.hostname + '#/' +       
        story.Project.ObjectID +
        'd/detail/' + story_type +
        '/' + story.ObjectID);
    }
  });
};

CLI.prototype.start = function (task, options) {
  var self = this,
      update_options = {state: 'In-Progress', own: true, blocked: false, pair: options.pair};

  this.ralio.setTaskState(this.fetchID(task), update_options, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.finish = function (task, options) {
  var self = this,
      update_options = {state: 'Completed', own: true, blocked: false, pair: options.pair};

  if (options.rootcause)
    update_options = _.extend(update_options, {rootcause: options.rootcause})
  if (options.resolution)
    update_options = _.extend(update_options, {resolution: options.resolution});

  this.ralio.setTaskState(this.fetchID(task), update_options, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.abandon = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), {state: 'Defined', own: false, blocked: false, pair: ""}, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.block = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), {blocked: true}, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.unblock = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), {blocked: false}, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.point = function (story, points) {
  var self = this;
  this.ralio.point(this.fetchID(story), points, function (error, story) {
    self.errors(error);
    self.printStoryLine(story, {quickid: false});
  });
};

CLI.prototype.task = function (option, story, opts) {
  var self = this,
      team = self.config.team,
      project = opts.project || self.config.project,
      projectName = project || team,
      tags = opts.tags ? opts.tags.split(',') : [];

  this.ralio.task(option, projectName, this.fetchID(story), opts.name, tags, function (error, option, story, taskname) {
    self.errors(error);
    self.printStoryLine(story, {quickid: false});
  });
};

CLI.prototype.errors = function (error) {
  if (error !== null) {
    error = typeof error === "object" ? error.message : error
    console.log(error.red);
    process.exit(1);
  }
};

CLI.prototype.printStoryLine = function (story, options) {
  var defaults = {state: true, owners: false, tags: true, quickid: true};
  options = _.extend({}, defaults, options || {});
  var fields = [];
  if (options.quickid) {
    fields.push(this.quickID(story));
  }
  fields.push(story.FormattedID.yellow);
  fields.push((story.PlanEstimate || '-').toString().blue);
  if (options.state) {
    var state = STATES[story.ScheduleState];
    if (typeof state === "string") {
      fields.push(story.Blocked ? state.red : state.green);
    }
  }
  fields.push(story.Name);
  if (options.owners) {
    var owners = [];
    story.Tasks.forEach(function (task) {
      if (task.State == "In-Progress" && task.Owner !== null) {
        owners.push(task.Owner._refObjectName);
      }
    });
    fields.push(owners.join(', ').blue);
  }
  if (options.tags) {
    fields.push(_.map(story.Tags, function (t) { return t.Name }).join(', ').blue);
  }
  console.log(fields.join(' '));
};

CLI.prototype.printTaskLine = function (task, options) {
  var defaults = {quickid: true, tab: true, tags: true, points: false};
  options = _.extend({}, defaults, options || {});
  
  var taskState = TASKSTATES[task.ScheduleState || task.State] || '.',
      owner = task.Owner !== null ? "❙ " + task.Owner._refObjectName : '',
      fields = [],
      pair = (task.Pair && task.Pair !== "" && task.Pair !== "true" && task.Pair !== null) ? "& " + task.Pair : null;

  if (options.quickid) {
    fields.push(this.quickID(task));
  }
  if (options.tab)
    fields.push(' ');

  fields.push(task.FormattedID.yellow);
  if (options.points)
    fields.push((task.PlanEstimate || '-').toString().blue);

  fields.push(task.Blocked ? taskState.red : taskState.green);
  fields.push(task.Name);
  fields.push(task.State == "In-Progress" ? owner.blue : owner);
  
  if (pair) {
    fields.push(task.State == "In-Progress" ? pair.blue : pair);
  }

  if (options.tags) {
    fields.push(_.map(task.Tags, function (t) { return t.Name }).join(', ').blue);
  }

  console.log(fields.join(' '));
};

CLI.prototype.quickID = function (task_or_story) {
  if (this.task_ids === undefined) {
    this.task_ids = [];
  }
  this.task_ids.push(task_or_story.FormattedID);
  return this.rpad(this.task_ids.length, 3);
};

CLI.prototype.rpad = function (num, cols) {
  var ret = num.toString();
  while (ret.length < cols) {
    ret = ' ' + ret;
  }
  return ret;
};

CLI.prototype.saveQuickIDs = function () {
  if(this.task_ids !== undefined) {
    fs.writeFileSync(
      path.join(process.env.HOME, '.ralio_recent'),
      JSON.stringify(this.task_ids)
    );
  }
};

CLI.prototype.fetchID = function (id) {
  if (id.match(/^\d+$/)) {
    var quick_idx = parseInt(id, 10);
    if (this.quickIDs !== undefined && quick_idx <= this.quickIDs.length) {
      return this.quickIDs[quick_idx - 1];
    }
    else {
      console.error(('No quick ID ' + id + ' found').red);
      process.exit(1);
    }
  }
  return id;
}

var STATES = {
  "Suggestion": "?",
  "Defined": "·",
  "Submitted": "·",
  "In-Progress": "▸",
  "Completed": "✔",
  "Fixed": "✔",
  "Closed": "✔",
  "Accepted": "✩",
  "Released": "✮",
  "Grooming": "⌚"
};

var TASKSTATES = _.extend(STATES, {
  "Submitted": "·",
  "Defined": "·",
  "Open": "·",
  "In-Progress": "▸",
  "Completed": "✔",
  "Fixed": "✔",
  "Closed": "✔",
});

module.exports = CLI;
