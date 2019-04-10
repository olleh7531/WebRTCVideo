var call_token; //통신를 위한 고유 토큰
var signaling_server; //시그널링 서버
var peer_connection; // 피어 연결 오브젝트
/**/
var file_store = []; // 공유 파일 저장

function start() {
    // WebRTC 피어 연결 오브젝트 생성
    peer_connection = new rtc_peer_connection({ // RTCPeerConnection 구성
        "iceServers": [
            { "url": "stun:"+stun_server }, //STUN 서버 정보
        ]
    });

    //다른 피어에 ICE 후보를 전송하는 일반 핸들러
    peer_connection.onicecandidate = function (ice_event) {
        if (ice_event.candidate) {
            signaling_server.send(
                JSON.stringify({
                    type: "new_ice_candidate",
                    candidate: ice_event.candidate ,
                })
            );
        }
    };

    //원격지의 비디오 스트림 도착 시 이를 표기
    peer_connection.onaddstream = function (event) {
        connect_stream_to_src(event.stream, document.getElementById("remote_video"));
        //자리 표시자 숨기기 및 원격 비디오 표시
        document.getElementById("loading_state").style.display = "none";
        document.getElementById("open_call_state").style.display = "block";
    };

    //로컬 카메라로부터의 설정 스트림
    setup_video();

    //웹 소켓 API를 사용한 일반적인 시그널링 서버 연결 설
    signaling_server = new WebSocket("ws://localhost:1234");
    //signaling_server = new WebSocket("ws://127.0.0.1:1234");

    if (document.location.hash === "" || document.location.hash === undefined) { // 발신자
        //이 호출에 대한 고유한 토큰 생성
        //var token = Date.now()+"-"+Math.round(Math.random()*10000);
        var token = Math.round(Math.random()*10000);
        call_token = "#"+token;

        //ocation.hash를 이 호출의 고유 토큰으로 설정합니다.
        document.location.hash = token;

        signaling_server.onopen = function() {
            //설정 발신자 신호 처리기
            signaling_server.onmessage = caller_signal_handler;

            //통화에 참여한 신호 서버를 말합니다.
            signaling_server.send(
                JSON.stringify({
                    token:call_token,
                    type:"join",
                })
            );
        }

        document.title = "호출자";
        document.getElementById("loading_state").innerHTML = "통화 준비...친구에게 방문해 달라고 부탁하다:<br><br>"+document.location;
   } else { //해시를 가지고 있으므로 수신자임
       //location.hash에서 이 호출에 대한 고유한 토큰을 가져옵니다.
       call_token = document.location.hash;

       signaling_server.onopen = function() {
           //설정 발신자 신호 처리기
           signaling_server.onmessage = callee_signal_handler;

           //통화에 참여한 신호 서버를 말합니다.
           signaling_server.send(
               JSON.stringify({
                    token:call_token,
                    type:"join",
               })
           );

           //전화를 걸 수 있도록 당신이 도착했다고 전화를 건 사람에게 알리세요.
            signaling_server.send(
                JSON.stringify({
                    token:call_token,
                    type:"callee_arrived",
                })
            );

       }

       document.title = "수신자";
       document.getElementById("loading_state").innerHTML = "잠시 기다려 주십시오...통화 연결 중...";
   }

    document.getElementById("message_input").onkeydown = send_chat_message;
    document.getElementById("message_input").onfocus =function () {this.value = ""; }

    /*파일 공유 설정*/
    if(!(window.File && window.FileReader && window.FileList && window.Blob)){
       document.getElementById("file_sharing").style.display = "none";
        alert("this browser does not support file Sharing");
    }else{
        document.getElementById("file_add").onclick = click_file_input; // 수동 파일 선택
        document.getElementById("file_input").addEventListener("change", file_input, false); // 하나이상의 새 파일을 수신 감지
        document.getElementById("open_call_state").addEventListener("dragover", drag_over, false); // 드래그된 이벤트를 감지
        document.getElementById("open_call_state").addEventListener("drop", file_input, false); // 드롭된 이벤트를 감지
    }

}

//수동 파일 선택 시작
function click_file_input(event){
    document.getElementById('file_input').click();
}

// 수동 파일 선탯 또는 드롭 이벤트를 처리
function file_input(event){
    event.stopPropagation();
    event.preventDefault();
    var files = undefined;
    if (event.dataTransfer && event.dataTransfer.files !== undefined) {
        files = event.dataTransfer.files;
    } else if (event.target && event.target.files !== undefined) {
        files = event.target.files;
    }

    if(files.length > 1){
        alert("Please only selest one file at a time");
    } else if(!files[0].type.match('image.*')){
        alert("This demo only supports sharing image files");
    } else if(files.length == 1){
        var kb = (files[0].size/1024).toFixed(1);
        var new_message = "Sending file ...<br><strong>"+files[0].name+"</strong>("+kb+"KB)";
        signaling_server.send(
            JSON.stringify({
                token : call_token,
                type : "new_chat_message",
                message : new_message
            })
        );
        add_chat_message({user: "you", message: new_message });
        document.getElementById("file_list").innerHTML = get_file_div(signal.id)+document.getElementById("file_list").innerHTML;
        var reader = new FileReader();
        reader.onload = (function(file, id){
            return function (event){
                send_file(file.name, id, event.target.result);
            }
        }) (files[0], file_store.length);
        reader.readAsDataURL(files[0]);
    }
}

// 드래그앤 드롭 지원
// 파일이 창에 드래그되었을 때 리로딩하는 것을 방지 한다
function drag_over(event){
    event.stopPropagation();
    event.preventDefault();
}

//선택된 파일 전송
function send_file(name, file_id, data) {
    var default_width = 160;
    var default_height = 120;
    var img = document.getElementById("file_img_src");
    img.onload = function() {
        var image_width = this.width;
        var target_width = default_width;
        var image_height = this.height;
        var target_height = default_height;
        var top = 0;
        var left = 0;
        if(image_width > image_height){
           var ratio = target_width/image_width;
            target_height = image_hright*ratio;
            top = (default_height - target_height)/2;
        }else if(image_height > image_width){
            var ratio = target_height/image_height;
            target_width = image_width*ratio;
            left = (default_width - target_width)/2;
        }else{
            left = (default_width - default_height)/2;
            target_width = target_height;
        }
        var canvas = document.getElementById("file_thumbnail_canvas");
        canvas.width = default_width;
        canvas.height = default_height;
        var cc = canvas.getContext("2d");
        cc.clearRect(0,0,default_width,default_height);
        cc.drawImage(img, left, top, target_width, target_height);
        var thumbnail_data = canvas.toDataURL("image/png");
        document.getElementById("file-img-"+file_id).src = thumbnail_data;
        send_file_parts("thumbnaail", file_id, thumbnail_data);
        send_file_parts("file",file_id, data);
    }
    img.src = data;
}

//파일을 부분으로 나누고 각각을 따로 전송
function send_file_parts(type, id, data){
    var message_type = "new_file_part";

    var slice_sizs = 1024;

    var parts = data.length/slice_sizs;
    if(parts % 1 > 0){
       parts = Math.round(parts)+1;
    }
    for(var i = 0; i < parts; i++){
        var from = i * slice_sizs;
        var to = from+slice_sizs;
        var data_slice = data.slice(from, to);
        store_file_part(type, id, i, parts, data_slice);
        signaling_server.send(
           JSON.stringify({
                token : call_token,
                type : message_type,
                id:id,
                part: i,
                length:parts,
                data : data_slice
           })
        )
    }
}

//각각의 파일 조각을 로컬 파일 저장소에 저장
function store_file_part(type, id, part, length, data) {
    if(file_store[id] === undefined){
       file_store[id] = {};
    }

    if(file_store[id][type] === undefined){
       file_store[id][type] = {
           parts:[]
       };
    }

    if(file_store[id][type].length === undefined){
       file_store[id][type].length = length;
    }
    file_store[id][type].parts[part] = data;

}


//새로운 디스크립션을 처리하는 핸들러
function new_description_created(description) {
    peer_connection.setLocalDescription(
        description,
        function () {
            signaling_server.send(
                JSON.stringify({
                    token:call_token,
                    type:"new_description",
                    sdp:description
                })
            );
        },
        log_error
    );
}

//발신자의 시그널 처리
function caller_signal_handler(event) {
    var signal = JSON.parse(event.data);
    if (signal.type === "callee_arrived") {
        peer_connection.createOffer(
            new_description_created,
            log_error
        );
    } else if (signal.type === "new_ice_candidate") {
        peer_connection.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
        );
    } else if (signal.type === "new_description") {
        peer_connection.setRemoteDescription(
            new rtc_session_description(signal.sdp),
            function () {
                if (peer_connection.remoteDescription.type == "answer") {
                    //여기서 귀하의 맞춤형 답변 처리를 진행합니다.
                }
            },
            log_error
        );
    }else if(signal.type === "new_chat_message"){
        add_chat_message(signal);
    } else if(signal.type === "new_file_thumbnail_part"){
        store_file_part("thumbnail",signal.id, signal.part, signal.length, signal.data);
        if(file_store[signal.id].thumbnail.parts.length == signal.length){
           document.getElementById("file_list").innerHTML = get_file_div(signal.id)+document.getElementById("file_list").innerHTML;
            document.getElementById("file-img-"+signal.id).src = file_store[signal.id].thumbnail.parts.join("");
        }
    } else if(signal.type === "new_file_part"){
        store_file_part("file", signal.id, signal.part, signal.length, signal.data);
        update_file_progress(signal.id, file_store[signal.id].file.parts.length, signal.length);
    }else{
        //사용자 정의 시그널 타입으로 확장
    }
}

// 파일 공유 html템플릿
function get_file_div(id) {
return '<div id="file-'+id+'" class="file"><img class="file_img" id="file-img-'+id+'" onclick="display_file(event)" src="images/new_file_arriving.png" /><div id="file-progress-'+id+'" class="file_progress"></div></div>';
}

//파일 전송 진행 상황 표기
function update_file_progress(id, parts, length){
    var percentage = Math.round((parts/length)*100);
    if(percentage < 100){
       document.getElementById("file-progress-"+id).innerHTML = percentage+"%";
        document.getElementById("file-img-"+id).style.opacity = 0.25;
    } else {
        document.getElementById("file-progress-"+id).innerHTML = "";
        document.getElementById("file-img-"+id).style.opacity = 1;
    }
}

//전체 파일 표시
function display_file(event) {
    var match = event.target.id.match("file-img-(.*)");
    var file = file_store[match[1]].file;
    if(file.parts.length < file.length){
       alert("Please wait - file still transfering");
    }else{
        window.open(file.parts.join(""));
    }
}

//수진자의 시그널 처리
function callee_signal_handler(event) {
    var signal = JSON.parse(event.data);
    if (signal.type === "new_ice_candidate") {
        peer_connection.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
        );
    } else if (signal.type === "new_description") {
         peer_connection.setRemoteDescription(
            new rtc_session_description(signal.sdp),
             function () {
                 if (peer_connection.remoteDescription.type == "offer") {
                  peer_connection.createAnswer(new_description_created, log_error);
                }
             },
             log_error
         );
    }else if(signal.type === "new_chat_message") {
        add_chat_message(signal);
    }else{
        //사용저 정의 시그널 타입으로 확장
    }
}

function add_chat_message(signal){
    var messages = document.getElementById("messages");
    var user = signal.user || "them";
    messages.innerHTML = user+": "+signal.message+"<br/>\n"+messages.innerHTML;
}

function send_chat_message(e) {
    if(e.keyCode == 13){
        var new_message = this.value;
        this.value = "";
        signaling_server.send(
            JSON.stringify({
                token : call_token,
                type : "new_chat_message",
                message : new_message
            })
        );
        add_chat_message({ user: "you", message: new_message });
    }
}

//로컬 카메라의 스트림 설정
function setup_video() {
    get_user_media(
        {
            "audio": true, //로컬 마이크 접근 요청
            "video": true  //로컬 카메라 접근 요청
        },
        function (local_stream) { // 성공 시 콜백
            //preview the local camera & microphone stream (지역 카메라와 마이크 스트림을 미리 본다.)
            connect_stream_to_src(local_stream, document.getElementById("local_video"));
            // 로컬 스트림을 peer_connection에 추가하여 원격지 피어로 전송할 준비
            peer_connection.addStream(local_stream);
        },
        log_error // 에러 시 콜백
    );
}


//일반 에러 핸들러
function log_error(error){
    console.log(error);
}
