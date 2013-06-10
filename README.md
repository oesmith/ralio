# ralio

A *usable* command-line client for rally.

[![Build Status](https://travis-ci.org/oesmith/ralio.png)](https://travis-ci.org/oesmith/ralio)


## Installation

    $ npm install -g ralio

ralio also uses elinks to format HTML content - install it using homebrew or apt-get. 

## Configuration

Run the command `ralio configure` and follow the steps.

`username` and `password` should be self-explanatory. `project` and `team`
should contain the names of the Rally projects that correspond to your project
backlog and your team.  Where I work, we run multiple teams from a common
product backlog, hence the different options.  If you don't work that way,
put the same project name in both.

Unfortunately, Rally doesn't use OAuth (or any other kind of API keys), so
ralio needs your password.  I suggest you `chmod 0600 ~/.raliorc` to prevent
your password going walkies. In future I'll be stashing credentials in the OS
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
        
        show <item>
        Show related information for an individual story, defect or task
        
        open <item>
        Open a story, defect or task in a web browser
        
        start <item>
        Set a task, defect or story state to in-progress and assign it to you
        
        finish [options] <item>
        Set a task, defect or story state to completed and assign it to you
        
        abandon <item>
        Set a task, defect or story state to defined and clear the owner
        
        block <item>
        Set a task, defect or story state to blocked
        
        unblock <item>
        Set a task, defect or story state to unblocked
        
        current 
        Show your current tasks and stories
        
        point <story> <points>
        Set the points for a story or defect
        
        task [options] <option> <target>
        Allow you to create and delete story tasks.
        Available options <option> [create|delete].
        In case of <option> create, <target> is the story name.
        In case of <option> delete, <target> is the task itself.

      Options:

        -h, --help     output usage information
        -V, --version  output the version number

      Usage Examples


      Creating and deleting story tasks:

        $ ralio task create US1234 -n "name of the task"
        $ ralio task create US1234 -n "name of the task" -t "BLUE TASK"
        $ ralio task delete TA54322

      Bug fixing:

        $ ralio finish DE1234
        $ ralio finish DE1234 --rootcause "Code Design/Error" --resolution "Code Change"

      Finishing a task:

        $ ralio finish TA1234

      Punctuating a story or defect:

        $ ralio point US1234
        $ ralio point DE1234

      Viewing your current sprint story and/or tasks:

        $ ralio sprint
        $ ralio sprint -t

      Viewing your current sprint story and/or tasks with filter by story's name:

        $ ralio sprint -t -f "some name"

      Viewing current's sprint of another project:

        $ ralio sprint -p "project_name"

      Pair programming:

        $ ralio start TA1234 --pair "Mark"
        $ ralio finish TA1234 --pair "Mark"

## Contributors
  * [Igor Escobar](http://github.com/igorescobar)
  * [Tom Garbutt](http://github.com/tommg)
  
Contributions very welcome! Please write tests for any new features - use [mocha](http://visionmedia.github.com/mocha/) to run the test suite.  See [CONTRIBUTONG.md](CONTRIBUTONG.md) for development instructions.

## License

[Simplified BSD license](http://en.wikipedia.org/wiki/BSD_licenses#2-clause_license_.28.22Simplified_BSD_License.22_or_.22FreeBSD_License.22.29)

Copyright (c) Olly Smith
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
