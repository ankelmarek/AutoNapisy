import {useCallback,useRef} from 'react';
type Props={id:string;video:boolean;src?:string;visible:boolean;onElement:(el:HTMLMediaElement|null)=>void;onMetadata:(el:HTMLMediaElement)=>void;onError:()=>void};
/** Stable DOM ref prevents detach/attach on every clock tick; removed clips stop immediately. */
export default function LocalMedia(props:Props){
 const latest=useRef(props);latest.current=props;
 const node=useRef<HTMLMediaElement|null>(null);
 const attach=useCallback((el:HTMLMediaElement|null)=>{if(!el)node.current?.pause();node.current=el;latest.current.onElement(el);},[]);
 const Tag=props.video?'video':'audio';
 return <Tag ref={attach} src={props.src} preload="metadata" className={props.visible?'composition-video':'composition-video gap'} onLoadedMetadata={e=>latest.current.onMetadata(e.currentTarget)} onError={()=>latest.current.onError()}/>;
}
