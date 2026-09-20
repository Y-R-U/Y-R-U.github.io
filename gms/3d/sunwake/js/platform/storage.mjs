import {SAVE_KEY,decodeSave,encodeSave} from '../core/save.mjs';
export function createStorage(notice){
 return {load(){try{const raw=localStorage.getItem(SAVE_KEY),save=decodeSave(raw);if(raw&&!save)notice('The old log was unreadable. A fresh voyage is ready.');return save;}catch{notice('Progress stays in this session');return null;}},
 save(boat,exploration,settings,fishing){try{localStorage.setItem(SAVE_KEY,encodeSave(boat,exploration,settings,fishing));return true;}catch{notice('Progress stays in this session');return false;}}};
}
