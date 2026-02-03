# Sample Box Form → Google Sheet: State Field Setup

The sample-box form now sends a **State** field (US states only, mandatory). Values are **2-letter abbreviations** (e.g. `CA`, `NY`, `FL`). To see this data in your Google Sheet, do the following.

---

## Step 1: Add a "State" column in the Google Sheet

1. Open your sheet:  
   https://docs.google.com/spreadsheets/d/1LYFV0Oj__8imSy0r2bRU8lAhB4lvfesqJs7ge1MFy2A/edit?gid=0#gid=0  
2. In **row 1 (header row)**, add a new column for **State**.
   - Put it where you want (e.g. after "Address" or "Phone"). Example order:  
     `Timestamp | Name | Email | Company | Address | State | Phone | Box Choice | Notes`
3. Save. The header name should match what you use in the script (e.g. `State`).

---

## Step 2: Update the Google Apps Script to write State

Your web app URL is something like:  
`https://script.google.com/macros/s/AKfycbydKGArw3wL4NNI0-lx0ZbSwmtAHHRTD3RzdZo0PYKJfn_EisMALt9qKcpjXKwg8OA/exec`

The script that handles the form does a `doPost(e)` and appends a row. You need to:

1. **Read the JSON body**  
   The site sends a **POST** with **JSON** body, for example:
   ```json
   {
     "timestamp": "2025-01-15T12:00:00.000Z",
     "name": "Jane",
     "email": "jane@example.com",
     "company": "Flower Shop",
     "address": "123 Main St, City, 12345",
     "state": "CA",
     "phone": "555-1234",
     "boxChoice": "roses",
     "notes": ""
   }
   ```
   So you must parse the body, not only `e.parameter` (which is for form-encoded or query params).

2. **Parse the body in Apps Script**  
   Example at the start of your `doPost`:
   ```javascript
   function doPost(e) {
     var data = {};
     try {
       if (e.postData && e.postData.contents) {
         data = JSON.parse(e.postData.contents);
       }
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid JSON' }))
         .setMimeType(ContentService.MimeType.JSON);
     }
     // ... rest of your code
   }
   ```

3. **Append a row including State**  
   When you append the row, add the value from `data.state` in the column that matches your "State" header.

   **Example** (adjust column order to match your sheet):
   ```javascript
   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
   sheet.appendRow([
     data.timestamp || '',
     data.name       || '',
     data.email      || '',
     data.company    || '',
     data.address    || '',
     data.state      || '',   // ← add this (2-letter code, e.g. CA, NY)
     data.phone      || '',
     data.boxChoice  || '',
     data.notes      || ''
   ]);
   ```
   Ensure the order of elements in `appendRow([...])` matches the order of columns in row 1 (including the new State column).

4. **Redeploy the web app**  
   After saving the script:  
   **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.**  
   The URL stays the same; new submissions will include State.

---

## Step 3: Verify

1. Submit a test request from the site:  
   https://your-site.com/sample-box  
   Choose a state (e.g. California) and fill other required fields.
2. In the sheet, confirm a new row appears with the **State** column filled (e.g. `CA`).

---

## Summary

| Step | Action |
|------|--------|
| 1 | Add a **State** header in row 1 of the sheet. |
| 2 | In Apps Script: parse `e.postData.contents` as JSON, then in `appendRow([...])` include `data.state` in the same position as the State column. |
| 3 | Redeploy the web app and send a test submission. |

The site already sends `state` (required, US only, 2-letter abbreviation); you only need the column and script update above for it to show in the sheet.
