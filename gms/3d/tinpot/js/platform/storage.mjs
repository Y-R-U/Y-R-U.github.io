import {parseSave,newCampaign} from '../core/save.mjs';
const KEY=new URLSearchParams(location.search).has('test')?'tinpot.test.campaign':'tinpot.campaign';
export function loadCampaign(){try{return parseSave(localStorage.getItem(KEY));}catch{return newCampaign();}}
export function storeCampaign(c){try{localStorage.setItem(KEY,JSON.stringify(c));return true;}catch{return false;}}
