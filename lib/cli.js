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
      if (story.ScheduleState != 'Accepted' || options.accepted) {
        printStoryLine(story, !options.tasks);
        if (options.tasks) {
          story.Tasks.forEach(function (task) {
            printTaskLine(task);
          });
        }
      }
    });
  });
};

CLI.prototype.current = function () {
  this.ralio.current(this.config.team, function (error, stories) {
    errors(error);
    stories.forEach(function (story) {
      printStoryLine(story);
      story.Tasks.forEach(function (task) {
        printTaskLine(task);
      });
    });
  });
}

CLI.prototype.show = function (story) {
  this.ralio.story(story, function (error, story) {
    errors(error);
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
        printStoryLine(story);
        if (description != '') {
          console.log('\n' + description + '\n');
        }
        story.Tasks.forEach(function (task) {
          printTaskLine(task);
        });
      });
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

CLI.prototype.start = function (task) {
  var self = this;
  this.ralio.setTaskState(task, 'In-Progress', true, function (error, task) {
    errors(error);
    printTaskLine(task);
  });
}

CLI.prototype.finish = function (task) {
  var self = this;
  this.ralio.setTaskState(task, 'Completed', true, function (error, task) {
    errors(error);
    printTaskLine(task);
  });
}

CLI.prototype.abandon = function (task) {
  var self = this;
  this.ralio.setTaskState(task, 'Defined', false, function (error, task) {
    errors(error);
    printTaskLine(task);
  });
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

function errors(error) {
  if (error !== null) {
    console.log(error);
    process.exit(1);
  }
}

function printStoryLine(story, showOwners) {
  var owners = [];
  story.Tasks.forEach(function (task) {
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
    showOwners ? owners.join(', ').blue : ''
  ].join(' '));
}

function printTaskLine(task) {
  var taskState = TASKSTATES[task.State];
  var owner = task.Owner !== null ? task.Owner._refObjectName : '';
  console.log([
    ' ',
    task.FormattedID.yellow,
    task.Blocked ? taskState.red : taskState.green,
    task.Name.white,
    task.State == "In-Progress" ? owner.blue : owner
  ].join(' '));
}

module.exports = CLI;

