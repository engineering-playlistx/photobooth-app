let's make this v7 scale up as "polish" project. refining what's done in the previous projects

start with the dashboard experience

- what is event status? how does it interact with the system? we need to define it and decide if we even need it. for flexibility, I guess we need it. but on the front end side, I don't think there's any implementation for that - don't know about the backend side if draft vs active will affect the way event config works
- there is guest and photo. those two is in a weird relationship. guest can only be recorded when the kiosk app has a form module (cmiiw) while photo is always recorded whenever there's a finished photobooth result recorded. this cause confusion about the performance of a photobooth. for example if we skip the form and see the guest is 0 we think no one uses the photobooth, but actually the photos are 100 or more - this is because the kiosk app doesn't use form module. we need to define each of the item and address the ux + technical issues. one of my quick solution is to keep them as it is but add copywriting like "guest - only recorded when there's a form" but the dashboard definitely needs to show "total photos" as well, not just "total guests"
- the guest and photo relationship is also reflected on the analytics. analytics only counts "guests" not "photos" or "sessions". this could cause confusion. there are many solutions. one of them is just to add photos count in the analytics.
- the guest portal needs to be checked if it's working or not. and I think the config of guest portal is not in the event config but in the result module in flow builder. but let's weight the decision when preparing for v7
- in the flow builder, I think when we add ai generation, the theme selection should be included or at least encourage / inform the user to include it. even include it in validation. because if we can save a broken config e.g. a flow where there's ai generation but no theme selection module, this will cause errors in the future. I think to save dev budget, we can go with validation instead of system behavior change, but let's discuss.
- printer name can be empty for Result module now. I think it should not be empty. and we might have a checking session for the flow builder, if current setup might cause users to save broken config files.
- there is no basic edit and delete function for events. we can't rename it or remove it - or even change the status from draft to active, if it's needed
- the same goes for organizations, no delete function. but there's rename. I know if we enable deletion, it will bring more complication. one of them is handling edge cases. where the org still has one or many event, where do those events belong when the org is deleted? I think we should not allow the user to delete any org that has an event in it.
- we should be able to customize the font being used in the kiosk app from the dashboard. ideally it's via css fields too. what is the solution for this? when we want to add new fonts, should we deploy new app or store the fonts in supabase storage? let's discuss

then the kiosk app

- when the camera feed is loading to show, there's no feedback like progress bar or spinner. only blank. so it's not setting any expectation. suddenly the camera feed pops up
- no sound during countdown
- no "flash" and shutter sound during frame take / picture take - this is a polished app feel
- this is a technical side, but should we make google ai generation process with polling the same as we did with the replicate one? please advise. from the ux perspective, the loading bar looks like being stuck in the early for too long and suddenly or very fast it finishes
- I don't know the current setup but is there an inactivity pop up modal? so instead of just redirects the user to homepage directly, we should show a pop up modal, giving a warning that under n seconds they will be redirected to the home page. this "n" is different than the current inactivity timer. so we will have 2 variables. inactivity timer that triggers pop up and then pop up timer that triggers redirect.
- download and print should be in separated buttons - ux reason
- after closing download/print modal, the button freeze on "processing" - I am not currently connected to any printer, maybe this is the cause, but we must check 
- there's a retry result button. it should retry generate another ai gen result. but now that we make the design modular, I think there's should be a config rule for the appearance of this button. I think the button can only be shown if the flow has ai gen module. the admin in the flow builder can choose via checkbox (bool type) whether they want to enable retry result or not - the setting is inside result module, and will be disabled if there's no ai gen module in the flow. is this too complicated? let's discuss

these are a lot I know, considering we have backlogs too. but we can prioritize for this v7 project. cheers