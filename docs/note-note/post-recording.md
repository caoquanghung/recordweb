Replace the review screen with the new figma design: https://www.figma.com/design/H8NiBxcFq1hEz3bFPtnhFS/RecordWeb-%E2%80%94-Studio---Preview?node-id=22-1520&t=pgVf7sGuIL4RVO4X-4

Do not care the left column in the new design. Keep the current implemented left sidebar.

The audio waveform should be showed for the developer only.

The source files listed under the "Download All Sources (ZIP)" button should be wraped in a scrollable component to optimize the space it ocupy and reduce information overhead for the users. 

Backend-related note:
- Every recording must be immediately uploaded safely to cloud. Before user type in the title.
- After forcing the user to type in the title, overwrite the title in database with the new one.

Force the user to type in the tiltle first
* Old design:
  - User has to click the button: upload to cloud to safely storage their recording session

* New design:
  - The recorded video must be automatically uploaded to cloud after user type in the title. 
  - remove the button "upload to cloud" and any text related to cloud, private,... as we base on the assumption that every recording must be immediately uploaded safely to cloud.


The logic under the button "record another" in the old design is getting some problem. Now, it must be replaced with the button: "Back on Live studio" on the top of the screen (like in the figma design), which refreshes the studio page. 


Reuse the cursor visualization (not be listed in the new design) for developer only.


