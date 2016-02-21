# com.logitech.harmony.hub
This repo containing the sources of the Harmony Hub App for Athom's fantastic [Homey](http://www.athom.com) product.

### 1. Install the Logitech Harmony Hub app
On your Homey's interface go to "Setting > Apps" and find and install the Logitech Harmony Hub app.
After the app is installed, you have access to a new type of device: Logitech Harmony Hub.

### 2. Add your Harmony Hub devices
On your Homey's interface go to "Devices". Select and add your Harmony Hub or Hubs. Hubs are discovered and listed automatically. If your Hub is not listed, make sure the Hub and your Homey are on the same network.
![](/assets/images/devices.png)

### 3. Create a flow using one of the Harmony Hub cards
Drag the Harmony Hub you want to control from the sidebar into the "...then" column of your flow and select the card you need. 
If you pick the "Start an activity" card, then don't forget to enter the name of the activity exactly the same as you see it in the remote controller or app. The name is case-sensitive!
![](/assets/images/example_flow.png)

#### Credits
Kudo's for the node.js lib to talk to the Harmony Hub go to [@swissmanu](https://github.com/swissmanu).