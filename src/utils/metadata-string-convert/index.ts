//internal helper to transform metadata strings as they can be either a string of length<63 or an array of strings <63
//e.g ["this is a very long ","string ","on the registry"] -> "this is a very long string on the registry"
export const metadataStringConvert = (value: string | string[] | undefined) => value == undefined ? undefined : typeof value === "string" ? value : value.join("");
