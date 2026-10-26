Please replace the current body of the studio page by using this new figma design:  https://www.figma.com/design/H8NiBxcFq1hEz3bFPtnhFS/RecordWeb-%E2%80%94-Studio---Preview?node-id=18-539&t=pgVf7sGuIL4RVO4X-4


I will specify some details:
The old design: 
- The Connecting buttons (microphone + webcam connecting button and google slide connect button) are all lying under the previewing space, which involve user to scroll down. These buttons are designed so simple.

- Allow user to choose between many webcame processing modes like: original, blur, cut,... 

The new design:
- Connecting button are moved to the right column, eliminating the need to scrolling down. Justfication: as the user mostly work on the google slide tab, preview screen shouldn't ocupy too much space, so it can left space on the right for the connecting actions.

- Original camera is the default. Do not allow user to choose blur or cut... (just plugout these logic implementation, do not delete source code)
- green text "ready" when all sources are connected successfully.

The user flow should be followed this order:
1. Connect Audio + Webcam.
2. Connect google Slide.
3. Record.

If they haven't finished the previous steps, the buttons for the later steps must be unactive.
-> need the UI state for active and unactive...


