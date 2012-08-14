var path = require('path'),
    fs = require('fs'),
    child_process = require('child_process'),
    colors = require('colors'),
    _ = require('underscore'),
    Ralio = require('./ralio');

function CLI() {
  this.configure();
  this.ralio = new Ralio(this.config.username, this.config.password);
}

CLI.prototype.configure = function () {
  this.config = JSON.parse(
    fs.readFileSync(
      path.join(process.env.HOME, '.raliorc')));
};

CLI.prototype.backlog = function (options) {
  var pagesize = options.all ? 100 : 20;
  this.ralio.backlog(this.config.product, pagesize, function (error, stories) {
    errors(error);
    if (!options.all) {
      stories = stories.slice(0, 20);
    }
    stories.forEach(function (story) {
      console.log(story.FormattedID.yellow + ' ' + story.Name.white);
    });
  });
};

CLI.prototype.sprint = function (options) {
  this.ralio.sprint(this.config.team, function (error, stories) {
    errors(error);
    stories.forEach(function (story) {
      printStory(story, options);
    });
  });
};

CLI.prototype.show = function (story) {
  this.ralio.story(story, function (error, story) {
    errors(error);
    if (story === null) {
      console.error('No story found :('.red);
    }
    else {
      printStory(story, {accepted: true, tasks: true});
    }
  });
}

CLI.prototype.open = function (story) {
  this.ralio.story(story, function (error, story) {
    errors(error);
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
}

var STATES = {
  "Suggestion": "?",
  "Defined": " ",
  "In-Progress": "▸",
  "Completed": "✔",
  "Accepted": "✩",
  "Released": "✮"
}

var TASKSTATES = {
  "Defined": " ",
  "In-Progress": "▸",
  "Completed": "✔"
}

function errors(error) {
  if (error !== null) {
    console.log(error);
    process.exit(1);
  }
}

function printStory(story, options) {
  if (story.ScheduleState != 'Accepted' || options.accepted) {
    var tasks = _.sortBy(story.Tasks, function (t) { return t.TaskIndex });
    var owners = [];
    tasks.forEach(function (task) {
      if (task.State == "In-Progress" && task.Owner !== null) {
        owners.push(task.Owner._refObjectName);
      }
    });
    var state = STATES[story.ScheduleState];
    console.log([
      story.FormattedID.yellow,
      (story.PlanEstimate || '-').toString().blue,
      story.Blocked ? state.red : state.green,
      story.Name.white,
      options.tasks ? '' : owners.join(', ').blue
    ].join(' '));
    if (options.tasks) {
      tasks.forEach(function (task) {
        var taskState = TASKSTATES[task.State];
        var owner = task.Owner !== null ? task.Owner._refObjectName : '';
        console.log([
          ' ',
          task.FormattedID.yellow,
          task.Blocked ? taskState.red : taskState.green,
          task.Name.white,
          task.State == "In-Progress" ? owner.blue : owner
        ].join(' '));
      });
    }
  }
}

module.exports = CLI;

