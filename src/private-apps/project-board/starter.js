// Explicit user-requested context only; never assistant notes or personal history.
export const starterProject = {id:'7be86c56-f62b-4bf9-bd98-98df596914a0',title:'Set up iMCP',description:'Review iMCP and plan a minimal setup. Nothing is installed or authorized by adding this project.',source_url:'https://github.com/mattt/iMCP'};
const checklist = [
 ['Select client and scope','Choose the AI client and the smallest useful read-only services. Confirm client compatibility; the author has not verified the ChatGPT/Codex flow end to end.'],
 ['Verify official release and signature','Review the official release, download source and code signature. Requires macOS 15.3 or later. Installed binary remains unverified.'],
 ['Install iMCP after approval','Pending separate user authorization. Do not install or generate credentials through this board.'],
 ['Test the connection without data permissions','After approved installation, use the permission-free system-sound tool to test the connection.'],
 ['Approve selected data permissions','Requires explicit approval for each selected service. Messages uses a folder-picker grant to ~/Library/Messages; attachments are a separate optional grant. Avoid blanket Full Disk Access.'],
 ['Verify a minimal read with writes disabled','Disable write/delete tools, then verify only the selected read. Calendar and Reminders include mutation tools; review each tool before enabling.'],
 ['Review networking and rollback','CLI uses STDIO; app communication uses Bonjour/local networking. Review exposure separately. Verify rollback by disabling services and removing trusted clients.'],
];
export const starterTasks = checklist.map(([title,description],i)=>({id:`7be86c56-f62b-4bf9-bd98-98df596914b${i}`,project_id:starterProject.id,title,description,status:'backlog',priority:'medium',due_date:null,source_url:starterProject.source_url,calendar_id:null,event_id:null}));
