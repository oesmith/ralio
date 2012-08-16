# ralio

A *usable* command-line client for rally.

## Installation

    $ npm install -g ralio

ralio also uses elinks to format HTML content - install it using homebrew.

## Configuration

Create a config file in `~/.raliorc`.

    {
      "username": "USERNAME",
      "password": "PASSWORD",
      "project": "BACKLOG PROJECT NAME",
      "team": "TEAM PROJECT NAME"
    }

`username` and `password` should be self-explanatory.  `project` and `team`
should contain the names of the Rally projects that correspond to your project
backlog and your team.  Where I work, we run multiple teams from a common
product backlog, hence the different options.  If you don't work that way,
put the same project name in both.

Unfortunately, Rally doesn't use OAuth (or any other kind of API keys), so
ralio needs your password.  I suggest you `chmod 0600 ~/.raliorc` to prevent
your password going walkies.  In future I'll be stashing credentials in the OS
key store.

## Usage

See the built-in help:

    $ ralio --help

      Usage: ralio [options] [command]

      Commands:

        backlog [options]
        Show the product backlog

        sprint [options]
        Show the current team iteration

        show <story>
        Show tasks for an individual story

        open <story>
        Open a story in a web browser

        start <task>
        Set a task state to in-progress and assign it to you

        finish <task>
        Set a task state to completed and assign it to you

        abandon <task>
        Set a task state to defined and clear the owner

        current
        Show your current tasks and stories

      Options:

        -h, --help     output usage information
        -V, --version  output the version number

