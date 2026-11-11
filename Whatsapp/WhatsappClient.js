// Compatibility adapter for the official transport. Browser sessions and QR logins are no longer used.
const notifications=require('../src/services/notifications.service');
module.exports={
  isWhatsappReady:()=>notifications.status().configured&&notifications.getConfig().enabled,
  sendMessage:async()=>false,
  getGroupChats:async()=>[],getQR:()=>null,forceRestart:()=>false,
};
