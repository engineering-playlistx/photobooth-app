- this phase we will focus more on the seamlessness of running multiple events with multiple clients
- currently, when we create a new event, there's still weird bug: config page (~/dashboard/events/event_id/config) can't be accessed 
- the error message on the console: config:1  GET https://photobooth-app-web.engineering-playlistx.workers.dev/dashboard/events/evt_1776049151063/config 500 (Internal Server Error)
main-6PiIsvxg.js:9 Error: Cannot coerce the result to a single JSON object
    at config:2:3553
    at config:2:3723
_d @ main-6PiIsvxg.js:9
Rd @ main-6PiIsvxg.js:9
Ad.f.componentDidCatch.t.callback @ main-6PiIsvxg.js:9
Cf @ main-6PiIsvxg.js:9
wf @ main-6PiIsvxg.js:9
Yd @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
gn @ main-6PiIsvxg.js:9
Jd @ main-6PiIsvxg.js:9
Sh @ main-6PiIsvxg.js:9
vh @ main-6PiIsvxg.js:9
oh @ main-6PiIsvxg.js:9
rh @ main-6PiIsvxg.js:9
Mh @ main-6PiIsvxg.js:9
Et @ main-6PiIsvxg.js:2

- the same / similar error also happen in page builder
- we also will customize per module. the most urgent one is to skip ai theme selection page when the theme is only one - we should define this further in the preparation phase