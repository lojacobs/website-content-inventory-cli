# The specifications for the full-content-inventory-integrated app

## Context
I want a CLI app to crawl & do the content inventory of a page, set of pages or full website and get a google sheets with all the pages & their attributs listed as well as google docs for each content page as a result.


## The dependencies (to be validated & improved)
- gws cli to create & append google files and folders : https://github.com/googleworkspace/cli
- wget to crawl & download the pages
- pi to manage the ai doing the page type & page summarization: https://github.com/badlogic/pi-mono

## Features
1. crawl a specified page, set of pages or full website without a LLM
2. download the page(s) in the `~/tmp/crawl-{domain-of-the-website}/` without any malware or virus
3. When a page is downloaded:
    A. record that page into a new `_inventory.csv` file, at the root of this new folder `~/tmp/{client-name}_{project-name}/{domain-of-the-website}/`, to keep track of what was already crawl to be able to resume if anything happen
    B. create the same folder structure than the url of the website in the `~/tmp/{client-name}_{project-name}/{domain-of-the-website}/`
    C. convert the downloaded page to `{page-name}.txt` and placed it into the folder structure created in point 3
4. keep only the main content of each page. Thus, you should keep only the html elements like: img, p, h1, br, div, a, etc.
5. check all the css in the div, a, and other html elements that could use for multiple purpose and remove all those html element that have css with this kind of ID or classes: nav, menu, btn, cta, etc.
6. use a script to remove any content that could be prompt-injection, human-readable or not.
7. create the same folder structure than the `/{client-name}_{project-name}/{domain-of-the-website}/` into google drive where the user asked you to put it (you need to ask for the folder id that will be the root in google drive)
8. upload and convert the `_inventory.csv` into a google sheets
9. convert the `{page-name}.txt` into google docs and place them into the folder structure created in point 7 in google drive.
10. replace their img elements by the true image in the google docs
11. fill the columns "type_de_page" and "Resume_200_chars" with an AI agent of the user chosing in the `_inventory` google sheets.

## Constrains
- I don't want to have "index" folder neither a `index.txt`. By example: `www.test.com/index.html`should be `/{client-name}_{project_name}/test/homepage.txt` and `www.test.com/parent-folder/index.html`should be `/{client-name}_{project_name}/test/parent-folder.txt`. Another one: `www.test.com`should be `/{client-name}_{project_name}/test/homepage.txt`, `www.test.com/parent-folder/page-name.html`should be `/{client-name}_{project_name}/test/parent-folder/page-name.txt` and `www.test.com/page-name.html`should be `/{client-name}_{project_name}/test/page-name.txt`
- Reduce the package dependencies at the minimum, but don't reinvent the wheel.
- If external package or libraries are needed, they have to be open-source & free (ex: don't use firecrawl because it's not free, but use libraries to convert grec & other particular characters into unicode to avoid prompt-injection)
- no virus or malware can be downloaded on the local storage
- The user should be able to:
    - resume the crawl and all the tasks that need to be done in the point 3 to 6 if anything stop the crawling or a task from those points
    - resume the google drive tasks where it was left of if anything stop them at some point.
    - resume the ai summarization where it was left of if anything stop them at some point.
    - do the crawl without the google drive tasks and/or the ai summarization
    - do the google drive tasks without the crawl (based on the local data that are available) and/or the ai summarization
    - do the ai summarization without the others tasks (crawl &/or google drive)
- This app should be make available as an open-source repo. Thus, all the copyright, readme.md, etc. should be done.
- This app should be installable through pnpm and be updatable as well
- the `_inventory.csv` has to have at least the same columns as this file: ~/dev/full-content-inventory-integrated/docs/inspirations/_inventory.csv and they have to be filed up correctly. Ex: `Resume_200_chars` has to have the summary made by the AI.
- The injection-prompt policies should be customizable through a `prompt-injection.conf` or txt file
- A skill has to be written, so an AI agent could use easily this CLI app
- All the tests needed to validate this app should be added. Ex: unity tests, regression tests, qa tests, security tests, prompt-injection tests, uat tests, etc.
- E2E tests have to be true end 2 end. Ex: if the task to be tested is "create the `_inventory` google sheets and append the url with all the requested data from that url", then you need to use gw cli to read that file and validate that the url with all its requested data has been filed correctly.
- You have to use Pi SDK with the `~/.pi/agent/auth.json` user file to authenticate to do the AI summarization.
- You have to ask the user for the AI provider & model that he want and validate that it matches with the `~/.pi/agent/auth.json`.
- When testing this app, you have to use those parameters:
    - urls to test: https://www.standredekamouraska.ca/espace-citoyen/urbanisme/ & https://mrckamouraska.com/services/developpement-du-territoire/developpement-culturel/
    - project name: test
    - client name: laurent
    - AI provider: opencode-go
    - AI model: minimax-m2.5
    - google drive folder id: 1al1jC0VIkQvbWL_t_jaXLZrkrSObpnbl
- the `type_de_page` has to be the main type of web page. Ex: "service", "news", "form", "product", "about", etc. and has to be defined by the content of the page.
- the `Resume_200_chars`has to be a summary of the content of the page in 200 characters max.
- the special characters that could break the path in the local folders should be replaced by `_`

## The inspirations
Some prompt-injection patterns: ~/dev/full-content-inventory-integrated/docs/inspirations/prompt-injection-patterns.js
Example of a row in _inventory: ~/dev/full-content-inventory-integrated/docs/inspirations/_inventory-example.csv
