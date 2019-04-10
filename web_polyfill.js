var webrtc_capable = true;
var rtc_peer_connection = null;
var rtc_session_description = null;
var get_user_media = null;
var connect_stream_to_src = null;
var stun_server = "stun.l.google.com:19302";

if(navigator.getUserMedia){
    rtc_peer_connection = RTCPeerConnection;
    rtc_session_description = RTCSessionDescription;
    get_user_media = navigator.getUserMedia.bind(navigator);
    connect_stream_to_src = function(media_stream, media_element){
        media_element.srcObject = media_stream;
        media_element.play();
    };
}else if(navigator.mozGetUserMedia){
    rtc_peer_connection = mozRTCPeerConnection;
    rtc_session_description = mozRTCSessionDescription;
    get_user_media = navigator.mozGetUserMedia.bind(navigator);
    connect_stream_to_src = function(media_stream, media_element){
        media_element.mozSrcObject = media_stream;
        media_element.play();
    };
    stun_server = "74.125.31.127:19302";
}else if(navigator.webkitGetUsermedia){
    rtc_peer_connection = webkitRTCPeerConnection;
    rtc_session_description = RTCSessionDescription;
    get_user_media = navigator.webkitGetUserMedia.bind(navigator);
    connect_stream_to_src = function(media_stream, media_element){
        media_element.src = webkitURL.createObjectURL(media_stream);
    };
}else{
    alert("이 브라우저는 We bR TC - visit를 지원하지 않습니다.");
    webrtc_capable = false;
}
