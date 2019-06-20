TaskCal
=======

Setup
-----

    % yarn
    % yarn clasp create --type standalone --rootDir ./dist
    % yarn push
    [...]
    ? Manifest file has been updated. Do you want to push and overwrite? (y/N) y
    % yarn clasp deploy
    % yarn clasp open

* [Create a new calendar on Google Calendar](https://calendar.google.com/calendar/r/settings/createcalendar) for your tasks and save its Calendar ID.
* [Run] -> [Run function] -> [doGet]
  * On dialog, [Review Permissions] and allow
* [File] -> [Project properties] -> [Script properties]
  * Add property CALENDAR_ID_TASKS with value set to your tasks calendar ID
* [Publish] -> [Deploy as web app...]
  * On dialog, get [Current web app URL] and open it
