import {imageAiCommand} from './_imageai.js';
import {describeImage} from '../services/publicAi.js';
export default imageAiCommand({name:'describe',aliases:['describeimg'],description:'Detailed description of a photo (free public AI)',perMinute:2,gpu:false,maxSide:1024,service:'Florence-2 on Hugging Face',format:'Description',work:describeImage});
