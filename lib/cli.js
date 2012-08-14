var path = require('path'),
    fs = require('fs'),
    colors = require('colors'),
    _ = require('underscore'),
    tab = require('tab'),
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

CLI.prototype.backlog = function () {
  this.ralio.backlog(this.config.product, function (error, stories) {
    errors(error);
    stories.forEach(function (story) {
      console.log(story.FormattedID + ' ' + story.Name);
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

CLI.prototype.story = function (story) {
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
      story.PlanEstimate.toString().blue,
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
          task.FormattedID,
          task.Blocked ? taskState.red : taskState.green,
          task.Name.white,
          task.State == "In-Progress" ? owner.blue : owner
        ].join(' '));
      });
    }
  }
}

module.exports = CLI;

