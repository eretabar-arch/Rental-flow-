const fs=require('fs');
const p='index.html';
let s=fs.readFileSync(p,'utf8');
const old="mail=await r.json()}catch(e){}detail.innerHTML=`";
const repl="mail=await r.json();if(!r.ok||!mail.stored){checkoutError.textContent=mail.error||'We could not safely store your reservation. Please try again.';checkoutError.classList.add('show');return}}catch(e){checkoutError.textContent='We could not safely store your reservation. Please check your connection and try again.';checkoutError.classList.add('show');return}detail.innerHTML=`";
if(!s.includes(old)){console.error('Target not found');process.exit(1)}
s=s.replace(old,repl);
fs.writeFileSync(p,s);
