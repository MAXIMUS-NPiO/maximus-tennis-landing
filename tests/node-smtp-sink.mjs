/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Dependency-free loopback SMTP sink. Captures test messages in memory, never relays mail. */
import net from 'node:net';
export async function startNodeSmtpSink() {
  const messages = [], sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setEncoding('utf8'); let buffer='', data=false, lines=[], from='', to=[];
    const reply=s=>socket.write(s+'\r\n');
    reply('220 localhost TEST ONLY SMTP sink');
    socket.on('data', chunk => {
      buffer+=chunk;
      for (;;) {
        const end=buffer.indexOf('\r\n'); if(end<0)break;
        const line=buffer.slice(0,end); buffer=buffer.slice(end+2);
        if(data) {
          if(line==='.') { messages.push({from,to:[...to],raw:lines.join('\r\n')});data=false;lines=[];reply('250 Captured locally'); }
          else lines.push(line.startsWith('..')?line.slice(1):line);
          continue;
        }
        if(/^EHLO|^HELO/i.test(line))reply('250-localhost\r\n250 PIPELINING');
        else if(/^MAIL FROM:/i.test(line)){from=line.slice(10);to=[];reply('250 OK');}
        else if(/^RCPT TO:/i.test(line)){to.push(line.slice(8));reply('250 OK');}
        else if(/^DATA$/i.test(line)){data=true;reply('354 End with dot');}
        else if(/^RSET$/i.test(line)){from='';to=[];lines=[];reply('250 OK');}
        else if(/^QUIT$/i.test(line)){reply('221 Bye');socket.end();}
        else if(/^NOOP$/i.test(line))reply('250 OK');
        else reply('502 TEST sink command unsupported');
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {port:server.address().port,messages,close:()=>new Promise(resolve=>{for(const s of sockets)s.destroy();server.close(resolve);})};
}
