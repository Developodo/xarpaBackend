const FCM = require('fcm-node');
const serverFCMKey='AAAAmN6lOgI:APA91bHNFBxH_ejv-vOz-zDlpCYKRQKur7pVbk59y-dAfWf7yMwwnc9T5iYYiXlAdrwhpzd9YzuF8uYy2-v8CxqCJ3Yq4iDtIaGENVuZ9DMyrgzx2p8nZnN6dQ4v2vrhym6Y3kUbLwGb';
const fcm = new FCM(serverFCMKey);

const sendMessage = (user, tit,msg,action,id_action,image,tag=0) => { 
    if(!image || image==null || image==undefined || image==''){
        image="https://myxarpa.herokuapp.com/static/avatarDefault.png"
    }
    let message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        registration_ids: user,
       /* registration_ids: [
            'dh7hRZrCQ9OKZyX-CK0mNJ:APA91bFejiY2-3iBoX4po7rtqhG561TbhO28p6dKb5pS1EqHaz089ORIUNQOXspue5fZUXX_Mw9blLktxQiKHRbnQauFNedelbOonJfotKT_ctWQCtWVqlXwkPdPEhMu26K_8DwLQ_JO',
            'fMIGCQ8sQ-ydLkmINgg2AE:APA91bE70hhCp0Lh6YdAmH0S4r6eJK-mMSz6115axbo560E_46p_zIvF2XBWvjKP5wDR8hKXoaRf-nGLAHtCo27_riYIGSnKX_v3j6Dw7Acy4CoyqdMwQ95ddPyThdmCzstSId2bHHYU'], */
        //collapse_key: 'your_collapse_key',
        
        //https://myxarpa.herokuapp.com/static/avatarDefault.png
       notification: {
            title: tit, 
            body: msg,
            "click_action":"FCM_PLUGIN_ACTIVITY",
            tag:tag,
            image: image
            //icon:"https://myxarpa.herokuapp.com/static/avatarDefault.png"
        },
        
        data: {  //you can send only notification or only data(or include both)
            action: action,
            tag:tag,
            id_action:id_action,
            title: 'Novedades en Xarpa', 
            body: msg,
            image:image,
            "click_action":"FCM_PLUGIN_ACTIVITY" 
        },
        priority:"high"
    };
    fcm.send(message, function(err, response){
        if (err) {
            console.log("Something has gone wrong!");
        } else {
            console.log("Successfully sent with response: ", response);
        }
    });
};

module.exports = {
    sendMessage
  };

