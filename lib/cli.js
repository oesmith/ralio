var path = require('path'),
    fs = require('fs'),
    child_process = require('child_process'),
    temp = require('temp'),
    colors = require('colors'),
    _ = require('underscore'),
    Ralio = require('./ralio');

function CLI() {
  this.configure();
  this.ralio = new Ralio(this.config.username, this.config.password);
}

CLI.prototype.configure = function () {
  var config_path = path.join(process.env.HOME, '.raliorc');
  this.config = JSON.parse(fs.readFileSync(config_path));

  var quickIDs_path = path.join(process.env.HOME, '.ralio_recent');
  if (fs.existsSync(quickIDs_path)) {
    this.quickIDs = JSON.parse(fs.readFileSync(quickIDs_path));
  }
};

CLI.prototype.backlog = function (options) {
  var self = this, opts = {
    projectName: options.project || this.config.product,
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
      team = options.project || this.config.team;
  this.ralio.sprint(team, function (error, stories) {
    self.errors(error);
    stories.forEach(function (story) {
      if (story.ScheduleState != 'Accepted' || options.accepted) {
        self.printStoryLine(story, {owners: !options.tasks});
        if (options.tasks) {
          story.Tasks.forEach(function (task) {
            self.printTaskLine(task);
          });
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
            '  Is elinks installed?  (hint: brew install elinks).'.red;
        }
        else {
          var description = stdout.replace(/^\n+/, '').replace(/\n+$/g, '');
        }
        fs.unlinkSync(descTempPath);
        self.printStoryLine(story);
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
  var self = this;
  this.ralio.story(this.fetchID(story), function (error, story) {
    self.errors(error);
    if (story === null) {
      console.error('No story found :('.red);
    }
    else {
      child_process.exec(
        'open ' +
        'https://rally1.rallydev.com/#/' +
        story.Project.ObjectID +
        'd/detail/' +
        (story._type == 'Defect' ? 'defect' : 'userstory') +
        '/' + story.ObjectID);
    }
  });
};

CLI.prototype.start = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), 'In-Progress', true, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.finish = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), 'Completed', true, function (error, task) {
    self.errors(error);
    self.printTaskLine(task, {quickid: false});
  });
};

CLI.prototype.abandon = function (task) {
  var self = this;
  this.ralio.setTaskState(this.fetchID(task), 'Defined', false, function (error, task) {
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

CLI.prototype.errors = function (error) {
  if (error !== null) {
    console.log(error);
    process.exit(1);
  }
};

CLI.prototype.printStoryLine = function (story, options) {
  var defaults = {state: true, owners: false, tags: false, quickid: true};
  options = _.extend({}, defaults, options || {});
  var fields = [];
  if (options.quickid) {
    fields.push(this.quickID(story));
  }
  fields.push(story.FormattedID.yellow);
  fields.push((story.PlanEstimate || '-').toString().blue);
  if (options.state) {
    var state = STATES[story.ScheduleState];
    fields.push(story.Blocked ? state.red : state.green);
  }
  fields.push(story.Name.white);
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
  var defaults = {quickid: true};
  options = _.extend({}, defaults, options || {});
  var taskState = TASKSTATES[task.State];
  var owner = task.Owner !== null ? task.Owner._refObjectName : '';
  var fields = [];
  if (options.quickid) {
    fields.push(this.quickID(task));
  }
  fields.push(' ');
  fields.push(task.FormattedID.yellow);
  fields.push(task.Blocked ? taskState.red : taskState.green);
  fields.push(task.Name.white);
  fields.push(task.State == "In-Progress" ? owner.blue : owner);
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
  "In-Progress": "▸",
  "Completed": "✔",
  "Accepted": "✩",
  "Released": "✮"
}

var TASKSTATES = {
  "Defined": "·",
  "In-Progress": "▸",
  "Completed": "✔"
}

module.exports = CLI;

