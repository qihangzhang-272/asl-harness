export function modeChanges(before,after) {
  if(!before||!after)return {added:[],removed:[],structure:false};
  return {added:after.skills.filter(id=>!before.skills.includes(id)),removed:before.skills.filter(id=>!after.skills.includes(id)),
    structure:before.document!==after.document||JSON.stringify(before.architecture)!==JSON.stringify(after.architecture)};
}
