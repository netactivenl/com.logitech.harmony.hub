# com.logitech.harmony.hub
[<img align="right" src="https://github.com/netactivenl/com.logitech.harmony.hub/raw/master/assets/images/donate.png">](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=4XUDMSVD2EZ3J)
This repo containing the sources of the Harmony Hub App for Athom's fantastic [Homey](http://www.athom.com) product.

### 1. Install the Logitech Harmony Hub app
On your Homey's interface go to "Setting > Apps" and find and install the Logitech Harmony Hub app.
After the app is installed, you have access to a new type of device: Logitech Harmony Hub.

### 2. Add your Harmony Hub devices
On your Homey's interface go to "Devices". Select and add your Harmony Hub or Hubs. Hubs are discovered and listed automatically. If your Hub is not listed, make sure the Hub and your Homey are on the same network.
![](https://github.com/netactivenl/com.logitech.harmony.hub/raw/master/assets/images/devices.png)

### 3. Create a flow using one of the Harmony Hub cards
Drag the Harmony Hub you want to control from the sidebar into the "...then" column of your flow and select the card you need. 
If you pick the "Start an activity" card, then don't forget to enter the name of the activity exactly the same as you see it in the remote controller or app. The name is case-sensitive!
![](https://github.com/netactivenl/com.logitech.harmony.hub/raw/master/assets/images/example_flow.png)
Or
![](https://github.com/netactivenl/com.logitech.harmony.hub/raw/master/assets/images/example_flow2.png)
Or
![](https://github.com/netactivenl/com.logitech.harmony.hub/raw/master/assets/images/example_flow3.png)

## Release history

### v1.0.2 (current)

* Fixed an issue that would break the "send a command" flow card's "control type" dropdown.
* Fixed an issue that would break the "send a command" flow card execution.
* The "send a command" flow card's "control type" and "activity" dropdowns now filter by input.

### v1.0.0

* App rewritten so it uses only one connection for each hub.
* PLEASE NOTE THIS RELEASE REQUIRES RE-ADDING YOUR HUB(S)!

### v0.3.4

* Fixed app crashes due to API changes in Homey v0.10.0 (credits go to Phuturist!).

### v0.3.3

* Fixed possible app crash while bashing the "send activity" device selection box.

### v0.3.2

* Removed "activity_changed" action card for now, because the polling was causing the app to crash (eventually) and the Hub to become less responsive.
 
### v0.3.1

* Improved error handling.

### v0.3.0

* Made activity on the "Start an activity" flow card selectable by changing the input field type from text to autocomplete.
* Added a new flow card "Send a command" that can send a command to a specific device.

### v0.2.0
* Moved flow cards from app to driver, so we support multiple Hubs.
* Added flow card to start an activity.
* Added flow card to turn all devices off.

#### Credits
Kudo's for the node.js lib to talk to the Harmony Hub go to [@swissmanu](https://github.com/swissmanu).