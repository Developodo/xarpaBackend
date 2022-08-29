const cloudinary = require('cloudinary').v2;
const Promise=require('promise');

cloudinary.config({ 
    cloud_name: 'xarpa', 
    api_key: '212241575957395', 
    api_secret: '0lDkKroE_jMAP7m0xY7OJeF8Isk' 
  })


  const uploadFile=(image,options={width: 300, height: 300, crop: "fill"})=>{
    return new Promise((resolve,reject)=>{
        cloudinary.uploader.upload(image,options, (error, result)=> {
            if(result && result.secure_url){
                resolve(result.secure_url);
            }else{
                reject(error)
            }
            //console.log(result, error)
        });
    })
    
  }
 const removeFile=(image)=>{
    return new Promise((resolve,reject)=>{
        cloudinary.uploader.destroy(image, (error, result)=> {
            resolve()
            //console.log(result, error)
        });
    })
 }
  module.exports = {
    uploadFile,
    removeFile
  };