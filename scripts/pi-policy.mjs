// Keep real event delivery separate from experimental AppKit/IME activation.
export function piServerEnvironment(previous={},args=[]){
 return {...previous,CU_ENABLE_FOREGROUND:previous.CU_ENABLE_FOREGROUND??'0',CU_EXPERIMENTAL_APPKIT_FOCUS:args.includes('--experimental-appkit-focus')?'1':'0'};
}
