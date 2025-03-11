## EN

### Aurion input

#### There 4 main trap that will be encountered when trying to fetch from Aurion:

-   Redirection : Aurion require redirection when changing page, but the redirection need other parameters so you need to manually fetch the redirection to account for parameter that may change (you will need to make 2 requests)
-   Changing parameters & in page parameters : Appart of cookie that are the same from the login to the end of the session two very import parameters for Aurion are ViewState that change whenever you change page and idts, there is multiple idt for different purpose that change from month to month. The big problem is that ViewState and idts are located in the body of HTML page. ViewState can be found in the value of an input named 'javax.faces.ViewState' and idts in the id of some div or in js script ... The idt for the Agenda is in the id of a div with class 'schedule'.
-   Header and Body parameters: there is some parameters to put in most header and body for Aurion mostly Content-Type for header and some javax parameters for body.
-   Number of link : to get to any page appart of the redirection mentionned above you also need to navigate the menu and sub-menu and for Agenda you also need to fetch the value after reaching page, that add-up to a lot of link with diferents changing parameters.

See url.md for pre made request or use Aurion normaly and record every request and response.

#### Specification for the Agenda

The Agenda take an idt_start and an idt_end as paramter which are Unix timestamp in milliseconds.

### Aurion output

Title of event :
The event title are a concatenation of classroom, description, discipline, type (example : TD, PROJECT, TP) ,instructors and sometime a trailing whitespace, separated by line return

Agenda event :
The response will give you all events that happen between the parameter start and the end of the day of the parameter end

### How to use

```javascript
const AurionAgendaAPI = require("AurionAgendaAPI");
const connection = new Connection(username, password);
const todayAgenda = new Agenda();
todayAgenda.setEvents = connection.fetchTodayAgenda();
console.log(todayAgenda.getAllEvents()); // Will print all events of today
```
