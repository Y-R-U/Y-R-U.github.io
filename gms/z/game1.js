/*********************************************
 * Tululoo Game Maker v2.0.0
 *
 * Creators
 * Zoltan Percsich
 * Vadim "YellowAfterlife" Dyachenko
 *
 * (c) SilentWorks 2011 - 2013
 * All rights reserved.
 * www.tululoo.com
 *
 * Contributors:
 * Csaba Herbut
 * Aaron Burke hacked in some Sprite Sheet support
 *             and replaced mp3 audio with acc/m4a
 ********************************************/

function tu_detect_audio(_type) {
	var _au = document.createElement('audio');
	return _au.canPlayType && _au.canPlayType(_type).replace(/no/, '');
}
//
var	__path__ = window.__path__ ? window.__path__ : '',
	// system variables:
	tu_gameloop = tu_canvas = tu_context = tu_room_to_go = null, tu_canvas_id = 'tululoocanvas',
	tu_canvas_css = 'background: rgb(42, 42, 42); border: 0;',
	tu_loading = tu_load_total = 0,
	var_override_ = (Object.defineProperty != undefined),
	// resources:
	tu_sprites = [], tu_audios = [], tu_backgrounds = [], tu_fonts = [], tu_scenes = [],
	tu_use_spr_sheets = false, //AB: ##### Make true to use Sprite Sheets
	// time:
	tu_frame_time = tu_frame_step = tu_frame_el = tu_frame_count = tu_elapsed = 0,
	tu_prev_cycle_time = tu_prev_frame_time = (new Date()).getTime(),
	// math:
	max = Math.max, min = Math.min, round = Math.round, floor = Math.floor, ceil = Math.ceil,
	sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, tan = Math.tan, rand = Math.random,
	arccos = Math.acos, arcsin = Math.asin, arctan = Math.atan, arctan2 = Math.atan2,
	tu_r2d = -180 / Math.PI, tu_d2r = Math.PI / -180, tu_2pi = Math.PI * 2,
	// i/o variables:
	mouse_x = mouse_y = 0, mouse_down = mouse_pressed = mouse_released = false,
	key_down = [], key_pressed = [], key_released = [], tu_vkeys = [],
	tu_keys_pressed = [], tu_keys_released = [],
	touch_x = [], touch_y = [], touch_count = 0,
	tu_unpausekey = 27, tu_paused = false, tu_modal = null, tu_modaldraw = true,
	// i/o constants:
	vk_0 = 48, vk_1 = 49, vk_2 = 50, vk_3 = 51, vk_4 = 52, vk_5 = 53, vk_6 = 54,
	vk_7 = 55, vk_8 = 56, vk_9 = 57, vk_a = 65, vk_add = 107, vk_alt = 18, vk_b = 66,
	vk_backspace = 8, vk_c = 67, vk_ctrl = 17, vk_d = 68, vk_decimal = 110, vk_delete = 46,
	vk_divide = 111, vk_down = 40, vk_e = 69, vk_end = 35, vk_enter = 13, vk_escape = 27,
	vk_f1 = 112, vk_f2 = 113, vk_f3 = 114, vk_f4 = 115, vk_f5 = 116, vk_f6 = 117,
	vk_f7 = 118, vk_f8 = 119, vk_f9 = 120, vk_f10 = 121, vk_f11 = 122, vk_f12 = 123,
	vk_g = 71, vk_h = 72, vk_home = 36, vk_f = 70, vk_i = 73, vk_insert = 45, vk_j = 74, vk_k = 75,
	vk_l = 76, vk_left = 37, vk_m = 77, vk_multiply = 106, vk_n = 78, vk_num0 = 96, vk_num1 = 97,
	vk_num2 = 98, vk_num3 = 99, vk_num4 = 100, vk_num5 = 101, vk_num6 = 102, vk_num7 = 103,
	vk_num8 = 104, vk_num9 = 105, vk_o = 79, vk_p = 80, vk_pagedown = 34, vk_pageup = 33,
	vk_pause = 19, vk_q = 81, vk_r = 82, vk_right = 39, vk_s = 83, vk_shift = 16, vk_space = 32,
	vk_subtract = 109, vk_t = 84, vk_tab = 9, vk_u = 85, vk_up = 38, vk_v = 86, vk_w = 87,
	vk_x = 88, vk_y = 89, vk_z = 90,
	// collisions:
	ct_null = 0, ct_point = 1, ct_box = 2, ct_circle = 3,
	// tiles:
	tu_tiles = [], tu_tilesi = [], tu_tilez = 256,
	// sound variables:
	tu_wav_supported = tu_detect_audio('audio/wav; codecs="1"'),
	tu_ogg_supported = tu_detect_audio('audio/ogg; codecs="vorbis"'),
	//tu_mp3_supported = tu_detect_audio('audio/mpeg;'), //Replaced by acc/m4a below:
	tu_acc_supported = tu_detect_audio('audio/x-m4a;') || tu_detect_audio('audio/aac;'), //AB: use this instead of mp3.
	// drawing:
	tu_draw_alpha = 1, tu_draw_color_red = tu_draw_color_green = tu_draw_color_blue = 0,
	tu_draw_font = "Arial 12px", tu_draw_halign = "left", tu_draw_valign = "top",
	tu_draw_font_ = { size: 12, family: 'Arial', bold: false, italic: false },
	tu_draw_color = "rgb(" + tu_draw_color_red + "," +
	tu_draw_color_green + "," + tu_draw_color_blue + ")",
	tu_redraw, tu_redraw_auto = true,
	tu_viewport_inst = null,
	// drawing constants:
	fa_left = "left", fa_center = "center", fa_right = "right",
	fa_top = "top", fa_middle = "middle", fa_bottom = "bottom",
	// system room variables:
	tu_depth = [], tu_depthi = [], tu_depthu = [], tu_types = [], tu_persist = [],
	// public room variables:
	room_current = null,
	room_speed = 30, fps = room_speed,
	room_background = null,
	room_width = 0, room_height = 0,
	room_background_color_show = true, room_background_color_red = 0,
	room_background_color_green = 0, room_background_color_blue = 0,
	room_viewport_width = 0, room_viewport_height = 0,
	room_viewport_object = null,
	room_viewport_hborder = 0, room_viewport_vborder = 0,
	room_viewport_x = 0, room_viewport_y = 0,
	global = null;
// keyboard functions:
function keyboard_check(_key) { return key_down[_key]; }
function keyboard_check_pressed(_key) { return key_pressed[_key]; }
function keyboard_check_released(_key) { return key_released[_key]; }
// mouse functions:
function mouse_check() { return mouse_down; }
function mouse_check_pressed() { return mouse_pressed; }
function mouse_check_released() { return mouse_released; }
// virtual keys:
function vkey() {
	this.top = 0;
	this.left = 0;
	this.right = 0;
	this.bottom = 0;
	this.key = 0;
	this.down = false;
	this.active = true;
}
function vkey_add(_x, _y, _w, _h, _k) {
	var _v = new vkey();
	_v.left = _x;
	_v.top = _y;
	_v.right = _x + _w;
	_v.bottom = _y + _h;
	_v.width = _w;
	_v.height = _h;
	_v.key = _k;
	tu_vkeys.push(_v);
	return _v;
}
// misc:
function trace() { console.log.apply(console, arguments); }
function tu_idle() { } // left empty on purpose
// minimal math:
function abs(_value) { return _value < 0 ? -_value : _value; }
function sign(_value) { return _value > 0 ? 1 : _value < 0 ? -1 : 0; }
function choose() { return arguments[~~(Math.random() * arguments.length)]; }
function random(_value) { return Math.random() * _value; }
function irandom(_value) { return ~~(Math.random() * _value + 1); }
// trig functions:
function lengthdir_x(_length, _direction) { return _length * Math.cos(_direction * tu_d2r); }
function lengthdir_y(_length, _direction) { return _length * Math.sin(_direction * tu_d2r); }
function point_distance(_x1, _y1, _x2, _y2) { return Math.sqrt(Math.pow(( _x1 - _x2), 2) + Math.pow((_y1 - _y2), 2)); }
function point_direction(_x1, _y1, _x2, _y2) { return Math.atan2(_y2 - _y1, _x2 - _x1) * tu_r2d; }
function degtorad(_degree) { return _degree * tu_d2r; }
function radtodeg(_degree) { return _degree * tu_r2d; }
// sound functions:
function sound_mode(_sound, _mode) {
	if (_sound.audio.networkState == _sound.audio.NETWORK_NO_SOURCE) return;
	switch (_sound.type) {
	case "wav": if (!tu_wav_supported) return; break;
	case "ogg": if (!tu_ogg_supported) return; break;
	case "mp3": if (!tu_acc_supported) return; break; //replaced tu_mp3_supported
	}
	if (_mode != 3) {
		_sound.audio.pause();
		if (_mode != 0) {
			_sound.audio.currentTime = 0;
		} else return;
		_sound.audio.loop = _mode > 1;
	}
	_sound.audio.play();
}
function sound_play(_sound) { sound_mode(_sound, 1); }
function sound_loop(_sound) { sound_mode(_sound, 2); }
function sound_resume(_sound) { sound_mode(_sound, 3); }
function sound_stop(_sound) { sound_mode(_sound, 0); }
function sound_stop_all() { for ( var _s = 0; _s < tu_audios.length; _s++) sound_stop( tu_audios[_s] ); }
function sound_volume( _sound, _volume) {
	if (_sound.audio.networkState == _sound.audio.NETWORK_NO_SOURCE) return;
	_sound.audio.volume = _volume;
}
// draw sprite:
function draw_sprite(_sprite_index, _sub_image, _x, _y) {
	if (_sprite_index == null) return;
	if (_sub_image > _sprite_index.frames.length - 1) _sub_image = 0;
	tu_context.save();
	tu_context.translate(_x - room_viewport_x, _y - room_viewport_y);
	tu_context.globalAlpha = tu_draw_alpha;
	if (tu_use_spr_sheets) { // AB ##### If we are using a spritesheet - tell drawImage where in the image this sprite lives...
	    var cl = _sprite_index.frames[0].width / _sprite_index.width; // AB ##### How many columns of sprites are there?
	    var xrow = floor(~~_sub_image / cl); var xcol = ~~_sub_image - (cl*xrow); // row # this sprite lives on.// col # this sprite lives on
	    tu_context.drawImage(_sprite_index.frames[0], xcol*_sprite_index.width, xrow*_sprite_index.height, _sprite_index.width, _sprite_index.height, -_sprite_index.xoffset, -_sprite_index.yoffset, _sprite_index.width, _sprite_index.height);
	}else{
	    tu_context.drawImage(_sprite_index.frames[~~_sub_image], -_sprite_index.xoffset, -_sprite_index.yoffset);
	}
	tu_context.restore();
}
function draw_sprite_part(_sprite_index, _sub_image, _left, _top, _width, _height, _x, _y) {
	if (_sprite_index == null) return;
	if (_sub_image >= _sprite_index.frames.length) _sub_image = _sub_image % _sprite_index.frames.length;
	tu_context.save();
	tu_context.translate(_x - room_viewport_x, _y - room_viewport_y);
	tu_context.globalAlpha = tu_draw_alpha;
	tu_context.drawImage(_sprite_index.frames[~~_sub_image], _left, _top, _width, _height, 0, 0, _width, _height);
	tu_context.restore();
}
function draw_sprite_ext(_sprite_index, _sub_image, _x, _y, _xscale, _yscale, _rotation, _alpha) {
	if (_sprite_index == null) return;
	if (_sub_image >= _sprite_index.frames.length) _sub_image = _sub_image % _sprite_index.frames.length;
	tu_context.save();
	tu_context.translate(_x - room_viewport_x, _y - room_viewport_y);
	tu_context.rotate(degtorad(_rotation));
	tu_context.scale(_xscale, _yscale);
	tu_context.globalAlpha = _alpha;
	if (tu_use_spr_sheets) { // AB ##### If we are using a spritesheet - tell drawImage where in the image this sprite lives...

	    var cl = _sprite_index.frames[0].width / _sprite_index.width; // AB ##### How many columns of sprites are there?
	    var xrow = floor(~~_sub_image / cl); var xcol = ~~_sub_image - (cl*xrow); // row # this sprite lives on.// col # this sprite lives on

	    tu_context.drawImage(_sprite_index.frames[0], xcol*_sprite_index.width, xrow*_sprite_index.height, _sprite_index.width, _sprite_index.height, -_sprite_index.xoffset, -_sprite_index.yoffset, _sprite_index.width, _sprite_index.height);
	}else{
	    tu_context.drawImage(_sprite_index.frames[~~_sub_image], -_sprite_index.xoffset , -_sprite_index.yoffset, _sprite_index.width, _sprite_index.height);
	}
	tu_context.restore();
}
// draw text:
function draw_text(_x, _y, _text) {
	tu_context.font = tu_draw_font;
	tu_context.textAlign = tu_draw_halign;
	tu_context.textBaseline = tu_draw_valign;
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(" + tu_draw_color + ", " + tu_draw_alpha + ")";
	tu_context.fillText( _text, _x - room_viewport_x, _y - room_viewport_y );
}
// draw shapes:
function draw_rectangle(_x1, _y1, _x2, _y2, _outline) {
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(" + tu_draw_color + ", " + tu_draw_alpha + ")";
	tu_context.beginPath();
	if (_outline) tu_context.strokeRect( _x1- room_viewport_x, _y1 - room_viewport_y, _x2 - _x1, _y2 - _y1 );
	else tu_context.fillRect( _x1- room_viewport_x, _y1 - room_viewport_y, _x2 - _x1, _y2 - _y1 );
	tu_context.closePath();
}
function draw_circle(_x, _y, _r, _outline) {
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(" + tu_draw_color + ", " + tu_draw_alpha + ")";
	tu_context.beginPath();
	tu_context.arc( _x - room_viewport_x, _y - room_viewport_y, _r, 0, tu_2pi, true );
	tu_context.closePath();
	!_outline ? tu_context.fill() : tu_context.stroke();
}

function draw_line(_x1, _y1, _x2, _y2) {
	tu_context.strokeStyle = "rgba(" + tu_draw_color + ", " + tu_draw_alpha + ")";
	tu_context.beginPath();
	tu_context.moveTo( _x1 - room_viewport_x, _y1 - room_viewport_y );
	tu_context.lineTo( _x2 - room_viewport_x, _y2 - room_viewport_y );
	tu_context.closePath();
	tu_context.stroke();
}
// draw settings:
function draw_set_alpha(_alpha) {
	tu_draw_alpha = _alpha;
}
function draw_set_color( _r, _g, _b) {
	tu_draw_color_red = _r;
	tu_draw_color_green = _g;
	tu_draw_color_blue = _b;
	tu_draw_color = tu_draw_color_red + "," + tu_draw_color_green + "," + tu_draw_color_blue;
	tu_context.fillStyle = "rgba(" + tu_draw_color + ", " + tu_draw_alpha + ")";
	tu_context.strokeStyle = "rgb(" + tu_draw_color + ")";
}
function draw_set_linewidth(_width) { tu_context.lineWidth = _width; }
// draw settings - font:
function draw_set_font (_font) {
	tu_draw_font_ = _font;
	tu_draw_font = (_font.bold == 1 ? "bold" : "") + " " + (_font.italic == 1 ? "italic" : "") + " " + _font.size + "px " + _font.family;
	tu_context.font = tu_draw_font;
	tu_context.textAlign = tu_draw_halign;
	tu_context.textBaseline = tu_draw_valign;
}
function draw_set_halign(_halign) { tu_draw_halign = _halign; }
function draw_set_valign(_valign) { tu_draw_valign = _valign; }
// room translations:
function room_goto(_scene) {
	tu_viewport_inst = null;
	tu_room_to_go = _scene;
}
function room_goto_next() {
	var _ri = 0, _r;
	for (_r = 0; _r < tu_scenes.length; _r++) if (tu_scenes[_r] == room_current) _ri = _r;
	if (typeof tu_scenes[(_ri + 1)] == "object") room_goto(tu_scenes[_ri + 1]);
}
function room_goto_previous() {
	var _ri = 0, _r;
	for (_r = 0; _r < tu_scenes.length; _r++) if (tu_scenes[_r] == room_current) _ri = _r;
	if (typeof tu_scenes[(_ri - 1)] == "object") room_goto(tu_scenes[_ri - 1]);
}
function room_goto_first() { room_goto(tu_scenes[0]); }
function room_goto_last() { room_goto(tu_scenes[(tu_scenes.length - 1)]); }
function room_restart() { room_goto(room_current); }
// instance functions:
function instance_create_(_x, _y, _object) {
	var o = new _object.constructor;
	o.parameters = arguments.length > 3 ? Array.prototype.slice.call(arguments, 3) : [];
	o.object_index = _object;
	o.__instance = true;
	o.xstart = o.x = _x;
	o.ystart = o.y = _y;
	o._depth = o.depthstart;
	instance_activate(o);
	return o;
}
function instance_create(_x, _y, _object) {
	var o = instance_create_.apply(this, arguments);
	o.on_creation();
	return o;
}
function instance_number(_object) {
	return instance_list(_object).length;
}
function instance_first(_object) {
	var l = instance_list(_object);
	return l.length ? l[0] : null;
}
// BBox <> BBox
function collide_bbox_bbox(l1, t1, r1, b1, l2, t2, r2, b2) {
	return !(b1 <= t2 || t1 >= b2 || r1 <= l2 || l1 >= r2);
}
// BBox <> SpriteBox
// (left, top, right, bottom, instX, instY, scaleX, scaleY, sprite, ofsX, ofsY)
function collide_bbox_sbox(l1, t1, r1, b1, x2, y2, h2, v2, s2) {
	return
	!( b1 <= y2 + v2 * (s2.collision_top - s2.yoffset)
	|| t1 >= y2 + v2 * (s2.collision_bottom - s2.yoffset)
	|| r1 <= x2 + h2 * (s2.collision_left - s2.xoffset)
	|| l1 <= x2 + h2 * (s2.collision_right - s2.xoffset));
}
// SpriteBox <> BBox
function collide_sbox_point(x2, y2, h2, v2, s2, x1, y1) {
	return
	!( y1 <= y2 + v2 * (s2.collision_top - s2.yoffset)
	|| y1 >= y2 + v2 * (s2.collision_bottom - s2.yoffset)
	|| x1 <= x2 + h2 * (s2.collision_left - s2.xoffset)
	|| x1 <= x2 + h2 * (s2.collision_right - s2.xoffset));
}
// SpriteBox <> Circle
function collide_sbox_circle(x2, y2, h2, v2, s2, x1, y1, r1) {
	var u, v, dx, dy;
	u = x2 + h2 * (s2.collision_left - s2.xoffset);
	v = x2 + h2 * (s2.collision_right - s2.xoffset);
	dx = (x2 < u ? u : x2 > v ? v : x2) - x2;
	u = y2 + v2 * (s2.collision_top - s2.yoffset);
	v = y2 + v2 * (s2.collision_bottom - s2.yoffset);
	dy = (y2 < u ? u : y2 > v ? v : y2) - y2;
	return (dx * dx + dy * dy < r1 * r1);
}
// BBox <> Point
function collide_bbox_point(l1, t1, r1, b1, x2, y2) {
	return (x2 > l1 && x2 < r1 && y2 > t1 && y2 < b1);
}
// BBox <> Circle
function collide_bbox_circle(l1, t1, r1, b1, x2, y2, r2) {
	var dx = (x2 < l1 ? l1 : x2 > r1 ? r1 : x2) - x2,
		dy = (y2 < t1 ? t1 : y2 > b1 ? b1 : y2) - y2;
	return (dx * dx + dy * dy < r2 * r2);
}
// Circle <> Range
function collide_circle_range(dx, dy, dr) {
	return (dx * dx + dy * dy < dr * dr);
}
// Circle <> Circle
function collide_circle_circle(x1, y1, r1, x2, y2, r2) {
	return collide_circle_range(x1 - x2, y1 - y2, r1 + r2);
}
// Circle <> Point
function collide_circle_point(x1, y1, r1, x2, y2) {
	return collide_circle_range(x1 - x2, y1 - y2, r1);
}
// instance collision checking:
function instance_position(_px, _py, _object, _mult) {
	var _x, _y, _ox, _oy, _sx, _sy, _o, _s, _i, _il, _r, _dx, _dy,
		_q = (_object.__instance ? [_object] : instance_list(_object)),
		_tm = (_mult) ? true : false;
	if (_tm) _ta = [];
	_il = _q.length;
	for (_i = 0; _i < _il; _i++) {
		_o = _q[_i];
		if (!_o.collision_checking) continue;
		_s = _o.sprite_index;
		if (!_s) continue;
		_x = _o.x; _sx = _o.image_xscale;
		_y = _o.y; _sy = _o.image_yscale;
		switch (_s.collision_shape)
		{
		case 0x2:
			if (_sx == 1 && _sy == 1) {
				_ox = _s.xoffset; _oy = _s.yoffset;
				if (!collide_bbox_point(_x + _s.collision_left - _ox, _y + _s.collision_top - _oy,
				_x + _s.collision_right - _ox, _y + _s.collision_bottom - _oy, _px, _py)) break;
			} else if (!collide_sbox_point(_x, _y, _sx, _sy, _s)) break;
			if (!_tm) return _o;
			_ta.push(_o);
			break;
		case 0x3:
			_r = _s.collision_radius * Math.max(_o.image_xscale, _o.image_yscale);
			_dx = _o.x + (_s.width / 2 - _s.xoffset) - _px;
			_dy = _o.y + (_s.height / 2 - _s.yoffset) - _py;
			if ((_dx * _dx) + (_dy * _dy) > _r * _r) break;
			if (!_tm) return _o;
			_ta.push(_o);
			break;
		}
	}
	return _tm ? _ta : null;
}
//
function __place_meeting__(nx, ny, what, many) {
	this.other = null;
	var i, l,
		// sprite, scale:
		ts = this.sprite_index,
		tsx, tsy, tfx, tfy, tst,
		// circle:
		tcx, tcy, tcr,
		// bbox:
		tbl, tbr, tbt, tbb,
		// instances, multiple, output, types:
		tz, tm, ct, ch, ra,
		// other:
		o, ox, oy, os, ost, osx, osy, ofx, ofy, ofr;
	if (ts == null) return false;
	tfx = ts.xoffset;
	tfy = ts.yoffset;
	tsx = this.image_xscale;
	tsy = this.image_yscale;
	tst = ts.collision_shape;
	// bbox:
	if (tst == 2) {
		tbl = nx + tsx * (ts.collision_left - tfx); //Aaron Burke: Collision detection a bit iffy?
		tbr = nx + tsx * (ts.collision_right - tfx);
		tbt = ny + tsy * (ts.collision_top - tfy);
		tbb = ny + tsy * (ts.collision_bottom - tfy); //This might be iffy as well?
	}
	// circle:
	if (tst == 3) {
		tcr = ts.collision_radius * (tsx > tsy ? tsx : tsy);
		tcx = nx + tsx * (ts.width / 2 - tfx);
		tcy = ny + tsy * (ts.height / 2 - tfy);
	}
	//
	tz = (what.__instance ? [what] : instance_list(what));
	tm = many ? true : false;
	if (tm) ra = [];
	l = tz.length;
	for (i = 0; i < l; i++) {
		o = tz[i];
		if (o == this) continue;
		if (!o.collision_checking) continue;
		os = o.sprite_index;
		if (os == null) continue;
		ox = o.x; osx = o.image_xscale;
		oy = o.y; osy = o.image_yscale;
		ost = os.collision_shape;
		ct = (tst << 4) | ost;
		ch = false;
		switch(ct) {
		case 0x22:
			if (osx == 1 && osy == 1) {
				ofx = os.xoffset; ofy = os.yoffset;
				if (!collide_bbox_bbox(tbl, tbt, tbr, tbb,
				ox + os.collision_left - ofx, oy + os.collision_top - ofy,
				ox + os.collision_right - ofx, oy + os.collision_bottom - ofy)) break;
			} else if (!collide_bbox_sbox(tbl, tbt, tbr, tbb, ox, oy, osx, osy, os)) break;
			ch = true;
			break;
		case 0x23:
			ofr = os.collision_radius * (osx > osy ? osx : osy);
			ofx = ox + osx * (os.width / 2 - os.xoffset);
			ofy = oy + osy * (os.height / 2 - os.yoffset);
			if (!collide_bbox_circle(tbl, tbt, tbr, tbb, ofx, ofy, ofr)) break;
			ch = true;
			break;
		case 0x32:
			if (osx == 1 && osy == 1) {
				ofx = os.xoffset; ofy = os.yoffset;
				if (!collide_bbox_circle(
				ox + os.collision_left - ofx, oy + os.collision_top - ofy,
				ox + os.collision_right - ofx, oy + os.collision_bottom - ofy,
				tcx, tcy, tcr)) break;
			} else if (!collide_sbox_circle(ox, oy, osx, osy, os, tcx, tcy, tcr)) break;
			ch = true;
			break;
		case 0x33:
			ofr = os.collision_radius * (osx > osy ? osx : osy);
			ofx = ox + osx * (os.width / 2 - os.xoffset);
			ofy = oy + osy * (os.height / 2 - os.yoffset);
			if (!collide_circle_circle(tcx, tcy, tcr, ofx, ofy, ofr)) break;
			ch = true;
			break;
		} if (!ch) continue;
		this.other = o;
		o.other = this;
		if (!tm) return (o);
		ra.push(o);
	} return ra;
}
function position_meeting(_x, _y, _object) {
	return instance_position(_x, _y, _object) != null;
}
function __move_towards_point__(_x, _y, _speed) {
	if (_speed == 0) return;
	if (this.x == _x && this.y == _y) return;
	var _dx = _x - this.x,
		_dy = _y - this.y,
		_dist = _dx * _dx + _dy * _dy;
	if (_dist < _speed * _speed) {
		this.x = _x;
		this.y = _y;
	} else {
		_dist = Math.sqrt(_dist);
		this.x += _dx * _speed / _dist;
		this.y += _dy * _speed / _dist;
	}
}

function __instance_destroy__() {
	tu_trash.push( this );
}
// web data:
function save_web_data(_name, _value) { if (window.localStorage) window.localStorage.setItem(_name, _value); }
function save_web_integer(_name, _value) { if (window.localStorage) window.localStorage.setItem("int_" + _name, _value); }
function save_web_float(_name, _value) { if (window.localStorage) window.localStorage.setItem("float_" + _name, _value); }
function save_web_string(_name, _value) { if (window.localStorage) window.localStorage.setItem("string_" + _name, _value); }
function load_web_data(_name) { if (window.localStorage) return window.localStorage.getItem(_name); }
function load_web_integer(_name) { if (window.localStorage) return parseInt(window.localStorage.getItem("int_" + _name)); }
function load_web_float(_name) { if (window.localStorage) return parseFloat(window.localStorage.getItem("float_" + _name)); }
function load_web_string(_name) { if (window.localStorage) return '' + window.localStorage.getItem("string_" + _name); }
function delete_web_data(_name) { if (window.localStorage) window.localStorage.removeItem(_name); }
function delete_web_integer(_name) { if (window.localStorage) window.localStorage.removeItem("int_" + _name); }
function delete_web_float(_name) { if (window.localStorage) window.localStorage.removeItem("float_" + _name); }
function delete_web_string(_name) { if (window.localStorage) window.localStorage.removeItem("string_" + _name); }
function clear_web_data() { if (window.localStorage) window.localStorage.clear(); }
function web_data_number() { if (window.localStorage) return window.localStorage.length; }
// misc functions:
function pause_game( _key) {
	tu_paused = true;
	tu_unpausekey = _key;
}
function modal_end() {
	if (tu_modal == null) return;
	tu_modal.instance_destroy();
	tu_modal = null;
}
function modal_start(_inst, _draw) {
	if (tu_modal != null) modal_end();
	tu_modal = _inst;
	tu_modaldraw = _draw;
}
//
function show_mouse() { tu_canvas.style.cursor = "default"; }
function hide_mouse() { tu_canvas.style.cursor = "none"; }
//
function tu_gettime() { return (new Date()).getTime(); }

/***********************************************************************
 * ENGINE
 ***********************************************************************/

function tu_global () { }
global = new tu_global();
//{ Events
function __keydownlistener__(e) {
	var r = true;
	if (!e) e = window.event;
	if (document.activeElement && document.activeElement == tu_canvas || document.activeElement == document.body) r = false;
	keydown_additions(e); // Call a function that can be replaced by the engine user.
	if (e.repeat) return;
	var keyCode = window.event ? e.which : e.keyCode;
	if (!key_down[keyCode]) {
		key_pressed[keyCode] = true;
		tu_keys_pressed.push(keyCode);
	}
	key_down[keyCode] = true;
	if (!r) e.preventDefault();
	return r;
};
function __keyuplistener__(e) {
	var r = true;
	if (!e) e = window.event;
	if (document.activeElement && document.activeElement == tu_canvas || document.activeElement == document.body) r = false;
	var keyCode = window.event ? e.which : e.keyCode;
	if (key_down[keyCode])
	{
		key_released[keyCode] = true;
		tu_keys_released.push(keyCode);
	}
	key_down[keyCode] = false;
	if (!r) e.preventDefault();
	return r;
};
function __touchsim__(_x, _y) {
	var r = [{}];
	r[0].pageX = tu_canvas.offsetLeft + _x;
	r[0].pageY = tu_canvas.offsetTop + _y;
	__touchvkey__(r);
}
function __mousemovelistener__(_e) {
	if (_e.pageX != undefined && _e.pageY != undefined) {
		mouse_x = _e.pageX;
		mouse_y = _e.pageY;
	} else {
		mouse_x = _e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
		mouse_y = _e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
	}
	if (room_current != null) {
		mouse_x -= tu_canvas.offsetLeft;
		mouse_y -= tu_canvas.offsetTop;
	}
	if (mouse_down) __touchsim__(mouse_x, mouse_y);
};
function __mousedownlistener__(_e) {
	//if (!mouse_down) mouse_pressed = true;
	//mouse_down = true;
	__touchsim__(mouse_x, mouse_y);
};
function __mouseuplistener__(_e) {
	//if (mouse_down) mouse_released = true;
	//mouse_down = false;
	__touchvkey__([]);
};
function __touchvkey__(_t) {
	var _tx = 0, _ty = 0, _tc = 0, _tl = _t.length, _vl = tu_vkeys.length, _i, _j, _c, _k,
		_dx = tu_canvas.offsetLeft, _dy = tu_canvas.offsetTop, _mx = _my = 1;
	if (tu_canvas.style.width) _mx
	touch_x = []; touch_y = []; touch_count = 0;
	for (_i = 0; _i < _vl; _i++) tu_vkeys[_i].count = 0;
	for (_i = 0; _i < _tl; _i++) {
		_c = 0;
		for (_j = 0; _j < _vl; _j++) {
			if (!tu_vkeys[_j].active) continue;
			if (_t[_i].pageX - _dx > tu_vkeys[_j].right) continue;
			if (_t[_i].pageX - _dx < tu_vkeys[_j].left) continue;
			if (_t[_i].pageY - _dy < tu_vkeys[_j].top) continue;
			if (_t[_i].pageY - _dy > tu_vkeys[_j].bottom) continue;
			tu_vkeys[_j].count++;
			if (!tu_vkeys[_j].down) {
				tu_vkeys[_j].down = true;
				_k = tu_vkeys[_j].key;
				if (!key_down[_k]) {
					key_down[_k] = true;
					key_pressed[_k] = true;
					tu_keys_pressed.push(_k);
				}
			}
			_c++;
		}
		if (_c == 0) {
			_tx += _t[_i].pageX;
			_ty += _t[_i].pageY;
			touch_x[_tc] = _t[_i].pageX - _dx;
			touch_y[_tc] = _t[_i].pageY - _dy;
			_tc++;
		}
	}
	for (_i = 0; _i < _vl; _i++) {
		if (tu_vkeys[_i].count != 0) continue;
		if (!tu_vkeys[_i].down) continue;
		tu_vkeys[_i].down = false;
		_k = tu_vkeys[_i].key;
		if (key_down[_k]) {
			key_down[_k] = false;
			key_released[_k] = true;
			tu_keys_released.push(_k);
		}
	}
	touch_count = _tc;
	if (_tc != 0) {
		mouse_x = (_tx / _tc) - _dx;
		mouse_y = (_ty / _tc) - _dy;
		if (!mouse_down) {
			mouse_down = true;
			mouse_pressed = true;
		}
	} else if (mouse_down) {
		mouse_down = false;
		mouse_released = true;
	}
};
function __touchlistener__(e) {
	e.preventDefault();
	__touchvkey__(e.targetTouches);
};
//}
function tu_init () {
	if (document.addEventListener) {
		document.addEventListener("keydown", __keydownlistener__, false);
		document.addEventListener("keyup", __keyuplistener__, false);
		document.addEventListener("mousemove", __mousemovelistener__, false);
		document.addEventListener("mousedown", __mousedownlistener__, false);
		document.addEventListener("mouseup", __mouseuplistener__, false);
		document.addEventListener("touchstart", __touchlistener__, false);
		document.addEventListener("touchend", __touchlistener__, false);
		document.addEventListener("touchmove", __touchlistener__, false);
		document.addEventListener("touchenter", __touchlistener__, false);
		document.addEventListener("touchleave", __touchlistener__, false);
		document.addEventListener("touchcancel", __touchlistener__, false);
	} else {
		document.attachEvent("onkeydown", __keydownlistener__);
		document.attachEvent("onkeyup", __keyuplistener__);
		document.attachEvent("onmousemove", __mousemovelistener__);
		document.attachEvent("onmousedown", __mousedownlistener__);
		document.attachEvent("onmouseup", __mouseuplistener__);
	}
	// initialize keycodes
	for (var _k = 0; _k < 256; _k++) {
		key_down[_k] = key_pressed[_k] = key_released[_k] = false;
	}
}

function keydown_additions () { return; } // This is a placeholder function.

function tu_loading_inc() { tu_loading++; tu_load_total++; }
function tu_loading_dec() { tu_loading--; }

function _$_(_id_) {
	return document.getElementById( _id_ );
}

function var_override(_what, _svar, _fget, _fset) {
	if (var_override_) {
		if (_what.hasOwnProperty(_svar)) return;
		Object.defineProperty(_what, _svar, {
			get: _fget,
			set: _fset
		});
	} else {
		if (_what.__lookupGetter__(_svar) != undefined) return;
		_what.__defineGetter__(_svar, _fget);
		_what.__defineSetter__(_svar, _fset);
	}
}

//{ Depth
function _tu_depth_find(_d) {
	var _tl = tu_depthi.length, _td, _ti;
	for (_ti = 0; _ti < _tl; _ti++) {
		_td = tu_depthi[_ti];
		if (_d > _td) return _ti;
	}
	return _tl;
}
function _tu_depth_new(_d) {
	var _i = _tu_depth_find(_d), _o = [];
	tu_depth.splice(_i, 0, _o);
	tu_depthi.splice(_i, 0, _d);
	return _i;
}
function tu_depth_add(_d, _o) {
	var _t = tu_depthi.indexOf(_d);
	if (_t == -1) _t = _tu_depth_new(_d); // create array if none
	tu_depth[_t].push(_o);
}
function tu_depth_delete(_d, _o) {
	var _t = tu_depth[tu_depthi.indexOf(_d)], _ti = _t.indexOf(_o);
	if (_ti == -1) return;
	_t.splice(_ti, 1);
}
function tu_depth_update() {
	var i, l = tu_depthu.length, o;
	if (l == 0) return;
	for (i = 0; i < l; i++) {
		o = tu_depthu[i];
		if (o.instance_active && o._depth !== undefined) tu_depth_delete(o._depth, o);
		o._depth = o._depthn;
		if (o.instance_active && o._depth !== undefined) tu_depth_add(o._depth, o);
		o._depthu = false;
	}
	tu_depthu = [];
}
// Accessors:
function tu_depth_get() { return this._depth; }
function tu_depth_set(_d) {
	if (this._depth == _d) return; // don't change on depth match
	this._depthn = _d;
	if (this._depthu) return;
	this._depthu = true;
	tu_depthu.push(this);
}
//}
//{ Types
function instance_list(_o) {
	var _t = _o._object_index_;
	if (tu_types[_t] == undefined) tu_types[_t] = [];
	return tu_types[_t];
}
function tu_type_add(_d, _o) {
	instance_list(_d).push(_o);
}
function tu_type_delete(_o, _p) {
	var _d = tu_types[_p], _t = _d.indexOf(_o);
	_d.splice(_t, 1);
}
function tu_type_get() { return this._object_index; }
//}
//{ Tileset functions
function tile_layer_find(_d) {
	var _tl = tu_tilesi.length, _td, _ti;
	for (_ti = 0; _ti < _tl; _ti++) {
		_td = tu_tilesi[_ti];
		if (_d > _td) return _ti;
	}
	return _tl;
}
function tile_layer_add(_d) {
	var _i = tile_layer_find(_d), _o = [];
	tu_tiles.splice(_i, 0, _o);
	tu_tilesi.splice(_i, 0, _d);
	return _o;
}
function tile(_s, _x, _y, _l, _t, _w, _h) {
	this.source = _s;
	this.x = _x;
	this.y = _y;
	this.left = _l;
	this.top = _t;
	this.width = _w;
	this.height = _h;
	this.width2 = _w;
	this.height2 = _h;
	this.sectors = [];
}
function tile_add(_b, _l, _t, _w, _h, _x, _y, _z) {
	var	_tx1 = Math.floor(_x / tu_tilez),
		_ty1 = Math.floor(_y / tu_tilez),
		_tx2 = Math.floor((_x + _w) / tu_tilez),
		_ty2 = Math.floor((_y + _h) / tu_tilez),
		_tt = new tile(_b, _x, _y, _l, _t, _w, _h),
		_tx, _ty, _ts,
		_d, _e = tu_tilesi.indexOf(_z);
	if (_e != -1) _d = tu_tiles[_e];
	else _d = tile_layer_add(_z);
	for (_tx = _tx1; _tx <= _tx2; _tx++) {
		if (_d[_tx] == null) _d[_tx] = [];
		for (_ty = _ty1; _ty <= _ty2; _ty++) {
			if (_d[_tx][_ty] == null) _d[_tx][_ty] = [];
			_ts = _d[_tx][_ty];
			_ts.push(_tt);
			_tt.sectors.push(_ts);
		}
	}
	return _tt;
}
function tile_find(_x, _y, _w, _h, _d) {
	var _xw = _x + _w,
		_yh = _y + _h,
		_r = [],
		_tx, _ty, _ti, _tl, _ts, _tt, _ta,
		_tx1, _ty1, _tx2, _ty2;
	_ti = tu_tilesi.indexOf(_d);
	if (_ti == -1) return _r;
	_ta = tu_tiles[_ti];
	_tx1 = Math.floor(_x / tu_tilez);
	_ty1 = Math.floor(_y / tu_tilez);
	_tx2 = Math.floor((_x + _w) / tu_tilez);
	_ty2 = Math.floor((_y + _h) / tu_tilez);
	for (_tx = _tx1; _tx <= _tx2; _tx++) {
		if (_ta[_tx] == null) continue;
		for (_ty = _ty1; _ty <= _ty2; _ty++) {
			if (_ta[_tx][_ty] == null) continue;
			_ts = _ta[_tx][_ty];
			_tl = _ts.length;
			for (_ti = 0; _ti < _tl; _ti++) {
				_tt = _ts[_ti];
				if (_tt.x >= _xw) continue;
				if (_tt.y >= _yh) continue;
				if (_tt.x + _tt.width2 < _x) continue;
				if (_tt.y + _tt.height2 < _y) continue;
				_r.push(_tt);
			}
		}
	}
	return _r;
}
function tile_delete(_t) {
	var _ti, _tl, _ts;
	_tl = _t.sectors.length;
	for (_ti = 0; _ti < _tl; _ti++) {
		_ts = _t.sectors[_ti];
		_ts.splice(_ts.indexOf(_t), 1);
	}
}
function tile_srender(_s) {
	var _ti, _tt;
	for (_ti = 0; _ti < _s.length; _ti++) {
		if (_s[_ti] == null) continue;
		_tt = _s[_ti];
		if (_tt.source == null) continue;
		if (_tt.source.image == null) continue;
		tu_context.drawImage(_tt.source.image, _tt.left, _tt.top, _tt.width, _tt.height, _tt.x - room_viewport_x, _tt.y - room_viewport_y, _tt.width2, _tt.height2);
	}
}
function tile_lrender(_l) {
	var _tx, _ty,
		_tx1 = Math.floor(room_viewport_x / tu_tilez),
		_tx2 = Math.floor((room_viewport_x + room_viewport_width) / tu_tilez),
		_ty1 = Math.floor(room_viewport_y / tu_tilez),
		_ty2 = Math.floor((room_viewport_y + room_viewport_height) / tu_tilez);
	for (_tx = _tx1; _tx <= _tx2; _tx++) {
		if (_l[_tx] == null) continue;
		for (_ty = _ty1; _ty <= _ty2; _ty++) {
			if (_l[_tx][_ty] == null) continue;
			tile_srender(_l[_tx][_ty]);
		}
	}
}
//} /Tileset functions
//{ Some events & accessors
function tu_id_get() { return this; }
function tu_parent_get() { return this._parent_index; }
function image_single_get() { return (this.image_speed == 0 ? this.image_index : -1); }
function image_single_set(_o) { this.image_speed = 0; this.image_index = _o; }
// Handles object size & sprite updates. Should get rid of this in favor of accessors.
function __handle_sprite__(_object_) {
	if (_object_.sprite_index == null) return;
	_object_.sprite_width = _object_.sprite_index.width;
	_object_.sprite_height = _object_.sprite_index.height;
	_object_.sprite_xoffset = _object_.sprite_index.xoffset;
	_object_.sprite_yoffset = _object_.sprite_index.yoffset;
	_object_.image_number = _object_.sprite_index.frames.length;
	_object_.image_index += _object_.image_speed;
	if (_object_.image_index >= _object_.image_number) _object_.image_index = _object_.image_index % _object_.image_number;
	if (_object_.image_index < 0) _object_.image_index = _object_.image_number - 1 + (_object_.image_index % _object_.image_number);
}
function __draw_self__() {
	draw_sprite_ext(this.sprite_index, this.image_index, this.x, this.y, this.image_xscale, this.image_yscale, this.image_angle, this.image_alpha);
}
//}
//{ Inherited event lookup functions.
// There's also a way to do this with much shorter code.
function on_creation_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_creation !== on_creation_i)
	return o.on_creation.apply(this);
}
function on_destroy_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_destroy !== on_destroy_i)
	return o.on_destroy.apply(this);
}
function on_step_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_step !== on_step_i)
	return o.on_step.apply(this);
}
function on_end_step_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_end_step !== on_end_step_i)
	return o.on_end_step.apply(this);
}
function on_draw_d() {
	__handle_sprite__(this);
	__draw_self__.apply(this);
}
function on_draw_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_draw !== on_draw_i)
	return o.on_draw.apply(this);
	on_draw_d.apply(this);
}
function on_collision_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_collision !== on_collision_i)
	return o.on_collision.apply(this);
}
function on_animationend_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_animationend !== on_animationend_i)
	return o.on_animationend.apply(this);
}
function on_roomstart_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_roomstart !== on_roomstart_i)
	return o.on_roomstart.apply(this);
}
function on_roomend_i() {
	for (var o = this.parent; o; o = o.parent)
	if (o.on_roomend !== on_roomend_i)
	return o.on_roomend.apply(this);
}
//} /Inherited event handles

// instance_init(this, object_index, parent_index, visible, depth, sprite, collideable, inner index)
// Universal object constructor:
function __instance_init__(_this, _oi, _p, _v, _d, _si, _c, _io) {
	_this._object_index = undefined;
	_this._object_index_ = _io;
	_this._depth = undefined;
	_this._depthn = undefined;
	_this._depthu = false;
	var_override(_this, 'depth', tu_depth_get, tu_depth_set );
	var_override(_this, 'object_index', tu_type_get, tu_idle );
	var_override(_this, 'image_single', image_single_get, image_single_set );
	var_override(_this, 'id', tu_id_get, tu_idle);
	var_override(_this, 'parent', tu_parent_get, tu_idle);
	_this._object_index = _oi;
	_this._parent_index = _p;
	_this.xstart = _this.xprevious = _this.x = 0;
	_this.ystart = _this.yprevious = _this.y = 0;
	_this.depthstart = _d;
	_this.image_angle = _this.direction = 0;
	_this.visible = _v;
	_this.image_yscale = _this.image_xscale = 1;
	_this.image_alpha = 1;
	_this.image_index = 0;
	_this.image_speed = 1;
	_this.sprite_index = _si;
	_this.speed = 0;
	_this.other = null;
	_this.collision_checking = _c;
	_this.persistent = false;
	_this.instance_active = false;
	// Instance-specific functions:
	_this.place_meeting = __place_meeting__;
	_this.move_towards_point = __move_towards_point__;
	_this.instance_destroy = __instance_destroy__;
	_this.draw_self = __draw_self__;
}
// Universal sprite constructor:
function __sprite_init__(_this, _name, _width, _height, _xofs, _yofs, _cshape, _crad, _cl, _cr, _ct, _cb, _frames) {
	_this.frames = [];
	var _frame, _fi;
	for (_fi = 0; _fi < _frames.length; _fi++) {
	    _frame = new Image();
	    if (tu_use_spr_sheets == false || _fi == 0){ // AB // ##### If using a sprite sheet - only load 1 image - leave blank array object for the rest (because I left the rest of code as is).
		if (_frames[_fi]) {
		    tu_loading_inc();
		    _frame.onload = tu_loading_dec;
		    _frame.onerror = tu_loading_dec;
		    _frame.src = _frames[_fi];
		}
	    }
	    _this.frames.push(_frame);
	}
	_this.width = _width;
	_this.height = _height;
	_this.xoffset = _xofs;
	_this.yoffset = _yofs;
	_this.collision_shape = (_cshape == 'Circle' ? ct_circle : _cshape == 'Box' ? ct_box : 0);
	_this.collision_radius = _crad;
	_this.collision_left = _cl;
	_this.collision_right = _cr;
	_this.collision_top = _ct;
	_this.collision_bottom = _cb;
	tu_sprites.push(_this);
}
// Universal audio constructor:
function __audio_init__(_this, _name, _wav, _mp3, _ogg) {
	var _src = '';
	_this.type = 'none';
	if (tu_ogg_supported && (_ogg != '')) {
		_this.type = 'ogg';
		_src = _ogg;
	} else if (tu_acc_supported && (_mp3 != '')) { //replaced tu_mp3_supported
		_this.type = 'mp3';
		_src = _mp3;
	} else if (tu_wav_supported && (_wav != '')) {
		_this.type = 'wav';
		_src = _wav;
	}
	if (_src != '') {
		_this.audio = document.createElement('audio');
		_this.audio.setAttribute('src', _src);
	}
	tu_audios.push(_this);
}

function __background_init__(_this, _name, _file) {
	_this.image = new Image();
	tu_loading_inc();
	_this.image.onload = tu_loading_dec;
	_this.image.onerror = tu_loading_dec;
	_this.image.src = _file;
	tu_backgrounds.push(_this);
}

function __font_init__(_this, _name, _family, _size, _bold, _italic) {
	_this.family = _family;
	_this.size = _size;
	_this.bold = _bold;
	_this.italic = _italic;
	tu_fonts.push(_this);
}

// (this, name, width, height, speed, back. red, back. green, back. blue, background, back. tilex, back. tiley, back. stretch, view width, view height, view object, view hborder, view vborder)
function __room_start__(_this, _name, _rw, _rh, _rs, _br, _bg, _bb, _bi, _bx, _by, _bs, _vw, _vh, _vo, _vx, _vy) {
	_$_('tululoogame').innerHTML = "<canvas id='" + tu_canvas_id + "' width='" + _vw + "' height='" + _vh + "' style='" + tu_canvas_css + "'></canvas>";
	tu_canvas = _$_(tu_canvas_id);
	tu_context = tu_canvas.getContext('2d');
	room_current = _this;
	// generic:
	room_speed = _rs;
	room_width = _rw;
	room_height = _rh;
	// background color:
	room_background_color_red = _br;
	room_background_color_green = _bg;
	room_background_color_blue = _bb;
	// background image:
	room_background = _bi;
	room_background_x = 0;
	room_background_y = 0;
	room_background_tile_x = _bx;
	room_background_tile_y = _by;
	room_background_tile_stretch = _bs;
	// view:
	room_viewport_width = _vw;
	room_viewport_height = _vh;
	room_viewport_x = room_viewport_y = 0;
	room_viewport_object = _vo;
	room_viewport_hborder = _vx;
	room_viewport_vborder = _vy;
	// tiles:
	var _l, _b, _t, _i, _il, _tls_, i, l, d, o, a;
	_tls_ = _this.tiles; tu_tiles = []; tu_tilesi = [];
	for (_l = 0; _l < _tls_.length; _l++)
	for (_b = 1; _b < _tls_[_l].length; _b++)
	for (_t = 1; _t < _tls_[_l][_b].length; _t++)
	tile_add(_tls_[_l][_b][0], _tls_[_l][_b][_t][0], _tls_[_l][_b][_t][1], _tls_[_l][_b][_t][2], _tls_[_l][_b][_t][3], _tls_[_l][_b][_t][4], _tls_[_l][_b][_t][5], _tls_[_l][0]);
	// objects:
	tu_depth = []; tu_depthi = []; tu_depthu = []; tu_types = [];
	a = _this.objects;
	l = a.length;
	for (i = 0; i < l; i++) {
		d = a[i];
		d = d[0]; // temp.fix for rc2
		if (d.o === undefined) continue;
		o = instance_create_(d.x, d.y, d.o);
		if (d.s !== undefined) o.sprite_index = d.s;
		if (d.d !== undefined) o.direction = d.d;
		if (d.a !== undefined) o.image_angle = d.a;
		if (d.u !== undefined) o.image_xscale = d.u;
		if (d.v !== undefined) o.image_yscale = d.v;
		if (d.c !== undefined) d.c.apply(o);
	}
	// persistent objects:
	_l = tu_persist.length
	for (_t = 0; _t < _l; _t++) instance_activate(tu_persist[_t]);
	instance_foreach(function(o) {
		if (tu_persist.indexOf(o) != -1) return;
		o.on_creation();
	});
	tu_persist = [];
	//
	instance_foreach(function(o) {
		o.on_roomstart();
	});
}

function tu_preloader() {
	var _w = Math.min(400, (tu_canvas.width * 0.6) >> 0), _h = 16,
		_x = (tu_canvas.width - _w) >> 1, _y = (tu_canvas.height - _h) >> 1,
		_p = (tu_load_total - tu_loading) / tu_load_total,
		_s = "Loading resources: " + (tu_load_total - tu_loading) + "/" + (tu_load_total);
	tu_canvas.width = tu_canvas.width;
	tu_canvas.height = tu_canvas.height;
	tu_canvas.style.backgroundColor = "rgb(42, 42, 42)";
	tu_context.font = "italic 12px Verdana";
	tu_context.textAlign = "left";
	tu_context.textBaseline = "bottom";
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(192, 192, 192, 1)";
	tu_context.fillRect(_x - 1, _y - 1, _w + 2, _h + 2);
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(0, 0, 0, 1)";
	tu_context.fillRect(_x, _y, _w, _h);
	tu_context.fillStyle = tu_context.strokeStyle = "rgba(255, 255, 255, 1)";
	tu_context.fillRect(_x + 2, _y + 2, (_w - 4) * _p, _h - 4);
	tu_context.fillText(_s, _x, _y - 2);
}

function tu_render_back() {
	if (room_background == null) return;
	if (room_background_tile_stretch) {
		tu_context.drawImage(room_background, 0 - room_viewport_x, 0 - room_viewport_y, room_width, room_height);
		return;
	}
	var _bw, _bh, _bx, _by, _vx, _vy, _vw, _vh, _x1, _x2, _y1, _y2, _ht, _vt;
	_bw = room_background.width;
	_bh = room_background.height;
	_bx = room_background_x;
	if (room_background_tile_x) { _bx = _bx < 0 ? _bw - _bx % _bw : _bx % _bw; }
	_by = room_background_y;
	if (room_background_tile_y) { _bx = _by < 0 ? _bh - _by % _bh : _by % _bh; }
	//
	_vx = room_viewport_x;
	_vy = room_viewport_y;
	_vw = room_viewport_width;
	_vh = room_viewport_height;
	//
	_x1 = room_background_tile_x ? Math.floor(_vx / _bw) * _bw - _bx : -_bx;
	_x2 = room_background_tile_x ? Math.floor((_vx + _vw + _bw) / _bw) * _bw : _x1 + _bw;
	_y1 = room_background_tile_y ? Math.floor(_vy / _bh) * _bh - _by : -_by;
	_y2 = room_background_tile_y ? Math.floor((_vy + _vh + _bh) / _bh) * _bh : _y1 + _bh;
	for (_ht = _x1; _ht < _x2; _ht += _bw)
	for (_vt = _y1; _vt < _y2; _vt += _bh)
	tu_context.drawImage(room_background, _ht - _vx, _vt - _vy);
}
// @1.2.6
function instance_activate(_i) {
	if (_i.instance_active) return;
	for (var o = _i._object_index; o; o = o.parent) tu_type_add(o, _i);
	//tu_type_add(_i._object_index, _i);
	//if (_i.parent != null) tu_type_add(_i.parent, _i);
	tu_depth_add(_i._depth, _i);
	_i.instance_active = true;
}
// @1.2.6
function instance_deactivate(_i) {
	if (!_i.instance_active) return;
	for (var o = _i._object_index; o; o = o.parent) tu_type_delete(o._object_index_, _i);
	//tu_type_delete(_i, _i._object_index_);
	//if (_i.parent != null) tu_type_delete(_i, _i.parent._object_index_);
	tu_depth_delete(_i._depth, _i);
	_i.instance_active = false;
}
// @1.2.6 Performs function for all instances
function instance_foreach(_function) {
	var _d, _l, _o;
	for (_d in tu_depth) {
		_l = tu_depth[_d];
		for (_o = 0; _o < _l.length; _o++) _function(_l[_o]);
	}
}
// @1.2.6 Performs function for all instances on specific depth
function instance_fordepth(_depth, _function) {
	var _o, _d = tu_depthc[_depth], _l;
	if (_d == null) return;
	_l = _d.length;
	for (_o = 0; _o < _l; _o++) _function(_d[_o]);
}
// @1.2.6 Actions performed on room switch
function tu_room_switchto_(_o) {
	_o.on_roomend();
	if (!_o.persistent) return;
	tu_persist.push(_o);
	instance_deactivate(_o);
}
function tu_room_switchto(_dest) {
	tu_persist = [];
	instance_foreach(tu_room_switchto_);
	room_current = _dest;
	tu_room_to_go = null;
	room_current.start();
}
// @1.0.0 Global step event
function tu_step() {
	// object step events:
	tu_trash = [];
	var tu_deptho, tu_depthl, _obj_, _objd_, _h, _v;
	for (tu_depthd in tu_depth) {
		tu_depthc = tu_depth[tu_depthd];
		tu_depthl = tu_depthc.length;
		for (tu_deptho = 0; tu_deptho < tu_depthl; tu_deptho++) {
			_obj_ = tu_depthc[tu_deptho];
			// is viewport object?
			if (room_viewport_object != null && tu_viewport_inst == null && (_obj_.object_index == room_viewport_object || _obj_.parent == room_viewport_object)) {
				tu_viewport_inst = _obj_;
			}
			// step events:
			_obj_.on_step();
			// move object:
			if (_obj_.speed != 0) {
				_objd_ = _obj_.direction * tu_d2r;
				_obj_.x += _obj_.speed * Math.cos(_objd_);
				_obj_.y += _obj_.speed * Math.sin(_objd_);
			}
			// post-step events:
			_obj_.on_collision();
			_obj_.on_end_step();
			// post:
			_obj_.xprevious = _obj_.x;
			_obj_.yprevious = _obj_.y;
		}
	}
	// follow object
	if (tu_viewport_inst != null) {
		_h = min(room_viewport_hborder, room_viewport_width / 2);
		_v = min(room_viewport_vborder, room_viewport_height / 2);
		// hborder:
		if (tu_viewport_inst.x < room_viewport_x + _h) room_viewport_x = tu_viewport_inst.x - _h;
		if (tu_viewport_inst.x > room_viewport_x + room_viewport_width - _h) room_viewport_x = tu_viewport_inst.x - room_viewport_width + _h;
		// vborder:
		if (tu_viewport_inst.y < room_viewport_y + _v) room_viewport_y = tu_viewport_inst.y - _v;
		if (tu_viewport_inst.y > room_viewport_y + room_viewport_height - _v) room_viewport_y = tu_viewport_inst.y - room_viewport_height + _v;
		// limits:
		room_viewport_x = Math.max(0, Math.min(room_viewport_x, room_width - room_viewport_width)) >> 0;
		room_viewport_y = Math.max(0, Math.min(room_viewport_y, room_height - room_viewport_height)) >> 0;
	}
}

function tu_draw() {
	// clear canvas:
	if (room_background_color_show) {
		tu_canvas.width = tu_canvas.width;
		tu_canvas.height = tu_canvas.height;
		// set background color:
		tu_canvas.style.backgroundColor = "rgb(" + room_background_color_red + "," + room_background_color_green + "," + room_background_color_blue + ")";
	}
	tu_render_back();
	tile_layer_last = 0;
	var tu_depthc, tu_depthv, tu_deptho, tu_depthl, _obj_;
	for (tu_depthd in tu_depth) {
		tu_depthc = tu_depth[tu_depthd];
		tu_depthv = tu_depthi[tu_depthd];
		for (; tu_tilesi[tile_layer_last] >= tu_depthv && tile_layer_last < tu_tiles.length; tile_layer_last++)
		{
			tile_lrender(tu_tiles[tile_layer_last]);
		}
		tu_depthl = tu_depthc.length;
		for (tu_deptho = 0; tu_deptho < tu_depthl; tu_deptho++) {
			_obj_ = tu_depthc[tu_deptho];
			if (_obj_.visible) _obj_.on_draw();
			_obj_.on_animationend();
		}
	}
	// render remaining tile layers:
	for (; tile_layer_last < tu_tiles.length; tile_layer_last++) {
		tile_lrender(tu_tiles[tile_layer_last]);
	}
}

function tu_prestep() {
	// clear mouse states and keypressed / keyrelesed statuses
	mouse_pressed = false;
	mouse_released = false;
	var _k, _r, _obj_;
	for (_k = 0; _k < tu_keys_pressed.length; _k++) key_pressed[tu_keys_pressed[_k]] = false;
	for (_k = 0; _k < tu_keys_released.length; _k++) key_released[tu_keys_released[_k]] = false;
	tu_keys_pressed = [];
	tu_keys_released = [];
	// remove objects from destroy stack
	for (_r = 0; _r < tu_trash.length; _r++) {
		_obj_ = tu_trash[_r];
		if (tu_modal == _obj_) tu_modal = null;
		_obj_.depth = undefined;
		tu_type_delete(_obj_, _obj_._object_index_);
		if (_obj_.parent != null) tu_type_delete(_obj_, _obj_.parent._object_index_);
		_obj_.on_destroy();
	}
}

function tu_loop() {
	// calculate render time
	tu_frame_time = tu_gettime();
	tu_elapsed = (tu_frame_time - tu_prev_frame_time);
	tu_frame_step += tu_elapsed;
	tu_frame_el += tu_elapsed;
	// continue game with the UN-Pause key
	if (tu_paused && keyboard_check_pressed(tu_unpausekey)) tu_paused = false;
	//
	if (tu_room_to_go != null && tu_canvas == null) tu_room_switchto(tu_room_to_go);
	// render game:
	if (tu_frame_step >= 1000 / room_speed && tu_loading == 0 && tu_canvas != null && !tu_paused) {
		tu_frame_count++;
		tu_elapsed = tu_frame_time - tu_prev_cycle_time;
		tu_prev_cycle_time = tu_frame_time;
		tu_frame_step -= 1000 / room_speed;
		if (tu_frame_step < 0 || tu_frame_step > 1024) tu_frame_step = 0;
		// start next room, if any:
		if (tu_room_to_go != null) tu_room_switchto(tu_room_to_go);
		//
		tu_redraw = tu_redraw_auto;
		if (tu_modal != null) {
			tu_modal.on_step();
			if (tu_modal != null) tu_modal.on_end_step();
		} else tu_step();
		tu_depth_update();
		if (tu_redraw) {
			if (tu_modal == null || tu_modaldraw) tu_draw();
			else tu_modal.on_draw();
		}
		tu_depth_update();
		tu_prestep();
		tu_depth_update();
	} else if (tu_loading > 0) tu_preloader();
	// calculate fps:
	if (tu_frame_el >= Math.floor(200 / room_speed) * 5 * room_speed)
	{
		fps = Math.ceil(tu_frame_count * 1000 / tu_frame_el);
		if (fps > room_speed) fps = room_speed;
		tu_frame_el = tu_frame_count = 0;
	}
	// repeat
	tu_prev_frame_time = tu_frame_time;
	setTimeout(tu_gameloop, 5);
}
tu_init();

/***********************************************************************
 * EXTENSIONS
 ***********************************************************************/


/* AutoScale by Bulow */

function canvas_set_style(key, value) {
	tu_canvas.style[key] = value;
}

function init_auto_scale() {
	canvas_set_style('position', 'absolute');
	if (window.innerWidth/room_viewport_width>window.innerHeight/room_viewport_height)
	{
		global.canvasWidth=room_viewport_width*(window.innerHeight/room_viewport_height);
		global.canvasHeight=window.innerHeight;
		global.canvasOffsetH=((window.innerWidth-(room_viewport_width*(window.innerHeight/room_viewport_height)))/2);
		global.canvasOffsetV=0;
	
		canvas_set_style('width', global.canvasWidth+'px');
		canvas_set_style('height', window.innerHeight+'px');
		canvas_set_style('left', global.canvasOffsetH+'px');
		canvas_set_style('top', '0px');
	}	
	else
	{
		global.canvasWidth=window.innerWidth;
		global.canvasHeight=room_viewport_height*(window.innerWidth/room_viewport_width);
		global.canvasOffsetH=0;
		global.canvasOffsetV=((window.innerHeight-(room_viewport_height*(window.innerWidth/room_viewport_width)))/2);
		
		canvas_set_style('width', window.innerWidth+'px');
		canvas_set_style('height', global.canvasHeight+'px');
		canvas_set_style('left', '0px');
		canvas_set_style('top', global.canvasOffsetV+'px');
	}

	window.onresize = function(event)
	{
		init_auto_scale();
	}
}

function mapx(x)
{
	return ((x)*room_viewport_width/global.canvasWidth);
}

function mapy(y)
{
	return ((y)*room_viewport_height/global.canvasHeight);
}







/* Text_UrlBoldWrap by Aaron Burke */


var lns = new Array();

function add_urlEvents() { // Add mouse listeners for the clickable links
	tu_canvas.addEventListener("mousemove", on_mousemove, false);
	tu_canvas.addEventListener("click", on_click, false);
}

function Text_UrlBoldWrap(ctx, start_x, start_y, maxWidth, text, fontSize, fontColor, fontName) {
    var color = fontColor || "white";
    var fName = fontName  || "Arial";
    
    var xOffTag = 0; var tlc = 0; var culw  = 0; //offset Tag, Total Line Count & Current used line width (how much of the line has already been used by eg.: a Bold Title.  
    var lines = new Array(); var result; var tUrl  = "";
    ctx.font  = fontSize + "px " + fName; ctx.fillStyle = color;

    text.split(/(<[^>]*>)/g).forEach(function(elem) {
        var width = 0, i, j;
        var wraps = tlc;
        
        switch (elem.slice(0,4)) {
            case "<b>": case "<B>":   ctx.font      = "bold " + fontSize + "px " + fName;      break;
            case "</b>": case "</B>": ctx.font      = fontSize + "px " + fName;                break;
            case "<a h": case "<A H": ctx.fillStyle = "blue"; tUrl = elem.split(/\s*(')/g)[2]; break;
            case "</a>": case "</A>": ctx.fillStyle = color;                                   break;
            case "<br>": case "<BR>": tlc += 1;culw = 0;                                       break;
            case "<fon": case "<FON": ctx.fillStyle = elem.split(/\s*(')/g)[2];                break;
            case "</fo": case "</FO": ctx.fillStyle = color;                                   break;
            case "<xof": case "<XOF": xOffTag       = elem.split(/\s*(')/g)[2];                break;
            default:
                // Start calculation
                while (elem.length) {
                    for (i = elem.length; (width = ctx.measureText(elem.substr(0, i)).width) > (maxWidth-culw-xOffTag); i--);
                    result = elem.substr(0, i);
                    if (i !== elem.length) for (j = 0; result.indexOf(" ", j) !== -1; j = result.indexOf(" ", j) + 1);
                    elem  = elem.substr(result.substr(0, j || result.length).length, elem.length);

                    //ctx.fillText(result.substr(0, j || result.length), start_x+8+culw, start_y+5+fontSize+(fontSize+5)*wraps);
                    
                    var isLnk = false; var xpos = 0; if (xOffTag > 0) {xpos = Number(xOffTag); culw = Number(xOffTag)+width; xOffTag = 0;} else xpos = start_x+8+culw;
                    if (tUrl != "") isLnk = true;   //We virtual print this into an array before we know everything about it, e.g. total height etc.
                    lines.push({"isLnk": isLnk, "href": tUrl, "x": start_x+8+culw, "y": 5+start_y+((wraps-1)*(fontSize+5)), "width": width, "height": fontSize, "fillFont": ctx.font, "fillStyle": ctx.fillStyle, "fillArray": {"str": result.substr(0, j || result.length), "str_x": xpos, "str_y": 5+start_y+((wraps-1)*(fontSize+5)) } });
                    tUrl = "";

                    if (!elem.length) culw += width; //If all text has been used - save the used amount on this line.
                    else {culw = 0; tlc += 1;}       //Otherwise wrap to the next line.
                    wraps += 1; j= null;             //Count how many times have we wrapped for this element.
                    
                    if (culw > maxWidth-30) {culw = 0; tlc +=1;} //could do a look ahead next element - but this should fix most.
                }
                break;
        }
    });
    return lines;
}

//check if the mouse is over the link and change cursor style
function on_mousemove (e) {
    if(inLink(e)) document.body.style.cursor = "pointer";
    else          document.body.style.cursor = "";
}

//if the link has been clicked, go to link
function on_click(e) { var itm = 0; if (itm = inLink(e)) window.open("http://"+lns[itm-1].href); } //window.location = lns[itm-1].href;

function inLink(e) {
    if (!lns) return false; var x, y;   
    // Get the mouse position relative to the canvas element.
    if (e.layerX || e.layerX == 0) { x = e.layerX; y = e.layerY; }//for firefox
    //x-=tu_canvas.offsetLeft; y-=tu_canvas.offsetTop;
    
    x = mapx(x); y = mapy(y); //scaling map.

    //is the mouse over the link?
    for (var i = lns.length - 1; i >= 0; i--) { if(lns[i].isLnk && x>=lns[i].fillArray.str_x && x <= (lns[i].fillArray.str_x + lns[i].width) && y>=lns[i].fillArray.str_y && y<= (lns[i].fillArray.str_y+lns[i].height)) {return i+1;}  }
    return 0;
}

function draw_lines(ctx, maxHeight, topAlign){ //Use topAlign (true/false) to align top (cut text that doesn't fit from bottom) or align bottom and cut text from top instead.
    if (!lns) return false;
    if (lns.length == 0) return false;

    topAlign = topAlign || false;      //Default to bottom align if value has not been passed.

    if (!topAlign) {
        var yOffset = 0; var str_height = (lns[lns.length-1].fillArray.str_y+20) - lns[0].fillArray.str_y; //Determine the Offset/what lines to show required based on maxHeight vs total String height.
        if (str_height > maxHeight) yOffset = maxHeight-str_height; else yOffset = maxHeight-str_height;   //How much cut - else how much to add(bottom align text).

        for (var i = 0; i < lns.length; i++) {
    	    if (str_height < maxHeight || lns[i].fillArray.str_y+yOffset > lns[0].fillArray.str_y) {       // Skip lines if they don't fit...)
	    	ctx.font = lns[i].fillFont; ctx.fillStyle = lns[i].fillStyle; lns[i].fillArray.str_y += yOffset //Set values and update offset position.
	    	ctx.fillText(lns[i].fillArray.str, lns[i].fillArray.str_x, lns[i].fillArray.str_y);
	    }
        }
    }else{ // Top align.
        for (var i = 0; i < lns.length; i++) {
    	    if (lns[i].fillArray.str_y+maxHeight > lns[0].fillArray.str_y+maxHeight-16) {       // Skip lines if they don't fit...)
	    	ctx.font = lns[i].fillFont; ctx.fillStyle = lns[i].fillStyle;                   //Set values and update offset position.
	    	ctx.fillText(lns[i].fillArray.str, lns[i].fillArray.str_x, lns[i].fillArray.str_y);
	    }
        }
    }
}




/***********************************************************************
 * SPRITES
 ***********************************************************************/
function __spr_wwolfGoblinZomie() { 
__sprite_init__(this, spr_wwolfGoblinZomie, 128, 128, 60, 88, 'Circle', 25, 0, 128, 0, 128, ['img/spr_wwolfGoblinZomie_0.png','img/spr_wwolfGoblinZomie_1.png','img/spr_wwolfGoblinZomie_2.png','img/spr_wwolfGoblinZomie_3.png','img/spr_wwolfGoblinZomie_4.png','img/spr_wwolfGoblinZomie_5.png','img/spr_wwolfGoblinZomie_6.png','img/spr_wwolfGoblinZomie_7.png','img/spr_wwolfGoblinZomie_8.png','img/spr_wwolfGoblinZomie_9.png','img/spr_wwolfGoblinZomie_10.png','img/spr_wwolfGoblinZomie_11.png','img/spr_wwolfGoblinZomie_12.png','img/spr_wwolfGoblinZomie_13.png','img/spr_wwolfGoblinZomie_14.png','img/spr_wwolfGoblinZomie_15.png','img/spr_wwolfGoblinZomie_16.png','img/spr_wwolfGoblinZomie_17.png','img/spr_wwolfGoblinZomie_18.png','img/spr_wwolfGoblinZomie_19.png','img/spr_wwolfGoblinZomie_20.png','img/spr_wwolfGoblinZomie_21.png','img/spr_wwolfGoblinZomie_22.png','img/spr_wwolfGoblinZomie_23.png','img/spr_wwolfGoblinZomie_24.png','img/spr_wwolfGoblinZomie_25.png','img/spr_wwolfGoblinZomie_26.png','img/spr_wwolfGoblinZomie_27.png','img/spr_wwolfGoblinZomie_28.png','img/spr_wwolfGoblinZomie_29.png','img/spr_wwolfGoblinZomie_30.png','img/spr_wwolfGoblinZomie_31.png','img/spr_wwolfGoblinZomie_32.png','img/spr_wwolfGoblinZomie_33.png','img/spr_wwolfGoblinZomie_34.png','img/spr_wwolfGoblinZomie_35.png','img/spr_wwolfGoblinZomie_36.png','img/spr_wwolfGoblinZomie_37.png','img/spr_wwolfGoblinZomie_38.png','img/spr_wwolfGoblinZomie_39.png','img/spr_wwolfGoblinZomie_40.png','img/spr_wwolfGoblinZomie_41.png','img/spr_wwolfGoblinZomie_42.png','img/spr_wwolfGoblinZomie_43.png','img/spr_wwolfGoblinZomie_44.png','img/spr_wwolfGoblinZomie_45.png','img/spr_wwolfGoblinZomie_46.png','img/spr_wwolfGoblinZomie_47.png','img/spr_wwolfGoblinZomie_48.png','img/spr_wwolfGoblinZomie_49.png','img/spr_wwolfGoblinZomie_50.png','img/spr_wwolfGoblinZomie_51.png','img/spr_wwolfGoblinZomie_52.png','img/spr_wwolfGoblinZomie_53.png','img/spr_wwolfGoblinZomie_54.png','img/spr_wwolfGoblinZomie_55.png','img/spr_wwolfGoblinZomie_56.png','img/spr_wwolfGoblinZomie_57.png','img/spr_wwolfGoblinZomie_58.png','img/spr_wwolfGoblinZomie_59.png','img/spr_wwolfGoblinZomie_60.png','img/spr_wwolfGoblinZomie_61.png','img/spr_wwolfGoblinZomie_62.png','img/spr_wwolfGoblinZomie_63.png','img/spr_wwolfGoblinZomie_64.png','img/spr_wwolfGoblinZomie_65.png','img/spr_wwolfGoblinZomie_66.png','img/spr_wwolfGoblinZomie_67.png','img/spr_wwolfGoblinZomie_68.png','img/spr_wwolfGoblinZomie_69.png','img/spr_wwolfGoblinZomie_70.png','img/spr_wwolfGoblinZomie_71.png','img/spr_wwolfGoblinZomie_72.png','img/spr_wwolfGoblinZomie_73.png','img/spr_wwolfGoblinZomie_74.png','img/spr_wwolfGoblinZomie_75.png','img/spr_wwolfGoblinZomie_76.png','img/spr_wwolfGoblinZomie_77.png','img/spr_wwolfGoblinZomie_78.png','img/spr_wwolfGoblinZomie_79.png','img/spr_wwolfGoblinZomie_80.png','img/spr_wwolfGoblinZomie_81.png','img/spr_wwolfGoblinZomie_82.png','img/spr_wwolfGoblinZomie_83.png','img/spr_wwolfGoblinZomie_84.png','img/spr_wwolfGoblinZomie_85.png','img/spr_wwolfGoblinZomie_86.png','img/spr_wwolfGoblinZomie_87.png','img/spr_wwolfGoblinZomie_88.png','img/spr_wwolfGoblinZomie_89.png','img/spr_wwolfGoblinZomie_90.png','img/spr_wwolfGoblinZomie_91.png','img/spr_wwolfGoblinZomie_92.png','img/spr_wwolfGoblinZomie_93.png','img/spr_wwolfGoblinZomie_94.png','img/spr_wwolfGoblinZomie_95.png','img/spr_wwolfGoblinZomie_96.png','img/spr_wwolfGoblinZomie_97.png','img/spr_wwolfGoblinZomie_98.png','img/spr_wwolfGoblinZomie_99.png','img/spr_wwolfGoblinZomie_100.png','img/spr_wwolfGoblinZomie_101.png','img/spr_wwolfGoblinZomie_102.png','img/spr_wwolfGoblinZomie_103.png','img/spr_wwolfGoblinZomie_104.png','img/spr_wwolfGoblinZomie_105.png','img/spr_wwolfGoblinZomie_106.png','img/spr_wwolfGoblinZomie_107.png','img/spr_wwolfGoblinZomie_108.png','img/spr_wwolfGoblinZomie_109.png','img/spr_wwolfGoblinZomie_110.png','img/spr_wwolfGoblinZomie_111.png','img/spr_wwolfGoblinZomie_112.png','img/spr_wwolfGoblinZomie_113.png','img/spr_wwolfGoblinZomie_114.png','img/spr_wwolfGoblinZomie_115.png','img/spr_wwolfGoblinZomie_116.png','img/spr_wwolfGoblinZomie_117.png','img/spr_wwolfGoblinZomie_118.png','img/spr_wwolfGoblinZomie_119.png','img/spr_wwolfGoblinZomie_120.png','img/spr_wwolfGoblinZomie_121.png','img/spr_wwolfGoblinZomie_122.png','img/spr_wwolfGoblinZomie_123.png','img/spr_wwolfGoblinZomie_124.png','img/spr_wwolfGoblinZomie_125.png','img/spr_wwolfGoblinZomie_126.png','img/spr_wwolfGoblinZomie_127.png','img/spr_wwolfGoblinZomie_128.png','img/spr_wwolfGoblinZomie_129.png','img/spr_wwolfGoblinZomie_130.png','img/spr_wwolfGoblinZomie_131.png','img/spr_wwolfGoblinZomie_132.png','img/spr_wwolfGoblinZomie_133.png','img/spr_wwolfGoblinZomie_134.png','img/spr_wwolfGoblinZomie_135.png','img/spr_wwolfGoblinZomie_136.png','img/spr_wwolfGoblinZomie_137.png','img/spr_wwolfGoblinZomie_138.png','img/spr_wwolfGoblinZomie_139.png','img/spr_wwolfGoblinZomie_140.png','img/spr_wwolfGoblinZomie_141.png','img/spr_wwolfGoblinZomie_142.png','img/spr_wwolfGoblinZomie_143.png','img/spr_wwolfGoblinZomie_144.png','img/spr_wwolfGoblinZomie_145.png','img/spr_wwolfGoblinZomie_146.png','img/spr_wwolfGoblinZomie_147.png','img/spr_wwolfGoblinZomie_148.png','img/spr_wwolfGoblinZomie_149.png','img/spr_wwolfGoblinZomie_150.png','img/spr_wwolfGoblinZomie_151.png','img/spr_wwolfGoblinZomie_152.png','img/spr_wwolfGoblinZomie_153.png','img/spr_wwolfGoblinZomie_154.png','img/spr_wwolfGoblinZomie_155.png','img/spr_wwolfGoblinZomie_156.png','img/spr_wwolfGoblinZomie_157.png','img/spr_wwolfGoblinZomie_158.png','img/spr_wwolfGoblinZomie_159.png','img/spr_wwolfGoblinZomie_160.png','img/spr_wwolfGoblinZomie_161.png','img/spr_wwolfGoblinZomie_162.png','img/spr_wwolfGoblinZomie_163.png','img/spr_wwolfGoblinZomie_164.png','img/spr_wwolfGoblinZomie_165.png','img/spr_wwolfGoblinZomie_166.png','img/spr_wwolfGoblinZomie_167.png','img/spr_wwolfGoblinZomie_168.png','img/spr_wwolfGoblinZomie_169.png','img/spr_wwolfGoblinZomie_170.png','img/spr_wwolfGoblinZomie_171.png','img/spr_wwolfGoblinZomie_172.png','img/spr_wwolfGoblinZomie_173.png','img/spr_wwolfGoblinZomie_174.png','img/spr_wwolfGoblinZomie_175.png','img/spr_wwolfGoblinZomie_176.png','img/spr_wwolfGoblinZomie_177.png','img/spr_wwolfGoblinZomie_178.png','img/spr_wwolfGoblinZomie_179.png','img/spr_wwolfGoblinZomie_180.png','img/spr_wwolfGoblinZomie_181.png','img/spr_wwolfGoblinZomie_182.png','img/spr_wwolfGoblinZomie_183.png','img/spr_wwolfGoblinZomie_184.png','img/spr_wwolfGoblinZomie_185.png','img/spr_wwolfGoblinZomie_186.png','img/spr_wwolfGoblinZomie_187.png','img/spr_wwolfGoblinZomie_188.png','img/spr_wwolfGoblinZomie_189.png','img/spr_wwolfGoblinZomie_190.png','img/spr_wwolfGoblinZomie_191.png','img/spr_wwolfGoblinZomie_192.png','img/spr_wwolfGoblinZomie_193.png','img/spr_wwolfGoblinZomie_194.png','img/spr_wwolfGoblinZomie_195.png','img/spr_wwolfGoblinZomie_196.png','img/spr_wwolfGoblinZomie_197.png','img/spr_wwolfGoblinZomie_198.png','img/spr_wwolfGoblinZomie_199.png','img/spr_wwolfGoblinZomie_200.png','img/spr_wwolfGoblinZomie_201.png','img/spr_wwolfGoblinZomie_202.png','img/spr_wwolfGoblinZomie_203.png','img/spr_wwolfGoblinZomie_204.png','img/spr_wwolfGoblinZomie_205.png','img/spr_wwolfGoblinZomie_206.png','img/spr_wwolfGoblinZomie_207.png','img/spr_wwolfGoblinZomie_208.png','img/spr_wwolfGoblinZomie_209.png','img/spr_wwolfGoblinZomie_210.png','img/spr_wwolfGoblinZomie_211.png','img/spr_wwolfGoblinZomie_212.png','img/spr_wwolfGoblinZomie_213.png','img/spr_wwolfGoblinZomie_214.png','img/spr_wwolfGoblinZomie_215.png','img/spr_wwolfGoblinZomie_216.png','img/spr_wwolfGoblinZomie_217.png','img/spr_wwolfGoblinZomie_218.png','img/spr_wwolfGoblinZomie_219.png','img/spr_wwolfGoblinZomie_220.png','img/spr_wwolfGoblinZomie_221.png','img/spr_wwolfGoblinZomie_222.png','img/spr_wwolfGoblinZomie_223.png','img/spr_wwolfGoblinZomie_224.png','img/spr_wwolfGoblinZomie_225.png','img/spr_wwolfGoblinZomie_226.png','img/spr_wwolfGoblinZomie_227.png','img/spr_wwolfGoblinZomie_228.png','img/spr_wwolfGoblinZomie_229.png','img/spr_wwolfGoblinZomie_230.png','img/spr_wwolfGoblinZomie_231.png','img/spr_wwolfGoblinZomie_232.png','img/spr_wwolfGoblinZomie_233.png','img/spr_wwolfGoblinZomie_234.png','img/spr_wwolfGoblinZomie_235.png','img/spr_wwolfGoblinZomie_236.png','img/spr_wwolfGoblinZomie_237.png','img/spr_wwolfGoblinZomie_238.png','img/spr_wwolfGoblinZomie_239.png','img/spr_wwolfGoblinZomie_240.png','img/spr_wwolfGoblinZomie_241.png','img/spr_wwolfGoblinZomie_242.png','img/spr_wwolfGoblinZomie_243.png','img/spr_wwolfGoblinZomie_244.png','img/spr_wwolfGoblinZomie_245.png','img/spr_wwolfGoblinZomie_246.png','img/spr_wwolfGoblinZomie_247.png','img/spr_wwolfGoblinZomie_248.png','img/spr_wwolfGoblinZomie_249.png','img/spr_wwolfGoblinZomie_250.png','img/spr_wwolfGoblinZomie_251.png','img/spr_wwolfGoblinZomie_252.png','img/spr_wwolfGoblinZomie_253.png','img/spr_wwolfGoblinZomie_254.png','img/spr_wwolfGoblinZomie_255.png','img/spr_wwolfGoblinZomie_256.png','img/spr_wwolfGoblinZomie_257.png','img/spr_wwolfGoblinZomie_258.png','img/spr_wwolfGoblinZomie_259.png','img/spr_wwolfGoblinZomie_260.png','img/spr_wwolfGoblinZomie_261.png','img/spr_wwolfGoblinZomie_262.png','img/spr_wwolfGoblinZomie_263.png','img/spr_wwolfGoblinZomie_264.png','img/spr_wwolfGoblinZomie_265.png','img/spr_wwolfGoblinZomie_266.png','img/spr_wwolfGoblinZomie_267.png','img/spr_wwolfGoblinZomie_268.png','img/spr_wwolfGoblinZomie_269.png','img/spr_wwolfGoblinZomie_270.png','img/spr_wwolfGoblinZomie_271.png','img/spr_wwolfGoblinZomie_272.png','img/spr_wwolfGoblinZomie_273.png','img/spr_wwolfGoblinZomie_274.png','img/spr_wwolfGoblinZomie_275.png','img/spr_wwolfGoblinZomie_276.png','img/spr_wwolfGoblinZomie_277.png','img/spr_wwolfGoblinZomie_278.png','img/spr_wwolfGoblinZomie_279.png','img/spr_wwolfGoblinZomie_280.png','img/spr_wwolfGoblinZomie_281.png','img/spr_wwolfGoblinZomie_282.png','img/spr_wwolfGoblinZomie_283.png','img/spr_wwolfGoblinZomie_284.png','img/spr_wwolfGoblinZomie_285.png','img/spr_wwolfGoblinZomie_286.png','img/spr_wwolfGoblinZomie_287.png','img/spr_wwolfGoblinZomie_288.png','img/spr_wwolfGoblinZomie_289.png','img/spr_wwolfGoblinZomie_290.png','img/spr_wwolfGoblinZomie_291.png','img/spr_wwolfGoblinZomie_292.png','img/spr_wwolfGoblinZomie_293.png','img/spr_wwolfGoblinZomie_294.png','img/spr_wwolfGoblinZomie_295.png','img/spr_wwolfGoblinZomie_296.png','img/spr_wwolfGoblinZomie_297.png','img/spr_wwolfGoblinZomie_298.png','img/spr_wwolfGoblinZomie_299.png','img/spr_wwolfGoblinZomie_300.png','img/spr_wwolfGoblinZomie_301.png','img/spr_wwolfGoblinZomie_302.png','img/spr_wwolfGoblinZomie_303.png','img/spr_wwolfGoblinZomie_304.png','img/spr_wwolfGoblinZomie_305.png','img/spr_wwolfGoblinZomie_306.png','img/spr_wwolfGoblinZomie_307.png','img/spr_wwolfGoblinZomie_308.png','img/spr_wwolfGoblinZomie_309.png','img/spr_wwolfGoblinZomie_310.png','img/spr_wwolfGoblinZomie_311.png','img/spr_wwolfGoblinZomie_312.png','img/spr_wwolfGoblinZomie_313.png','img/spr_wwolfGoblinZomie_314.png','img/spr_wwolfGoblinZomie_315.png','img/spr_wwolfGoblinZomie_316.png','img/spr_wwolfGoblinZomie_317.png','img/spr_wwolfGoblinZomie_318.png','img/spr_wwolfGoblinZomie_319.png','img/spr_wwolfGoblinZomie_320.png','img/spr_wwolfGoblinZomie_321.png','img/spr_wwolfGoblinZomie_322.png','img/spr_wwolfGoblinZomie_323.png','img/spr_wwolfGoblinZomie_324.png','img/spr_wwolfGoblinZomie_325.png','img/spr_wwolfGoblinZomie_326.png','img/spr_wwolfGoblinZomie_327.png','img/spr_wwolfGoblinZomie_328.png','img/spr_wwolfGoblinZomie_329.png','img/spr_wwolfGoblinZomie_330.png','img/spr_wwolfGoblinZomie_331.png','img/spr_wwolfGoblinZomie_332.png','img/spr_wwolfGoblinZomie_333.png','img/spr_wwolfGoblinZomie_334.png','img/spr_wwolfGoblinZomie_335.png','img/spr_wwolfGoblinZomie_336.png','img/spr_wwolfGoblinZomie_337.png','img/spr_wwolfGoblinZomie_338.png','img/spr_wwolfGoblinZomie_339.png','img/spr_wwolfGoblinZomie_340.png','img/spr_wwolfGoblinZomie_341.png','img/spr_wwolfGoblinZomie_342.png','img/spr_wwolfGoblinZomie_343.png','img/spr_wwolfGoblinZomie_344.png','img/spr_wwolfGoblinZomie_345.png','img/spr_wwolfGoblinZomie_346.png','img/spr_wwolfGoblinZomie_347.png','img/spr_wwolfGoblinZomie_348.png','img/spr_wwolfGoblinZomie_349.png','img/spr_wwolfGoblinZomie_350.png','img/spr_wwolfGoblinZomie_351.png','img/spr_wwolfGoblinZomie_352.png','img/spr_wwolfGoblinZomie_353.png','img/spr_wwolfGoblinZomie_354.png','img/spr_wwolfGoblinZomie_355.png','img/spr_wwolfGoblinZomie_356.png','img/spr_wwolfGoblinZomie_357.png','img/spr_wwolfGoblinZomie_358.png','img/spr_wwolfGoblinZomie_359.png','img/spr_wwolfGoblinZomie_360.png','img/spr_wwolfGoblinZomie_361.png','img/spr_wwolfGoblinZomie_362.png','img/spr_wwolfGoblinZomie_363.png','img/spr_wwolfGoblinZomie_364.png','img/spr_wwolfGoblinZomie_365.png','img/spr_wwolfGoblinZomie_366.png','img/spr_wwolfGoblinZomie_367.png','img/spr_wwolfGoblinZomie_368.png','img/spr_wwolfGoblinZomie_369.png','img/spr_wwolfGoblinZomie_370.png','img/spr_wwolfGoblinZomie_371.png','img/spr_wwolfGoblinZomie_372.png','img/spr_wwolfGoblinZomie_373.png','img/spr_wwolfGoblinZomie_374.png','img/spr_wwolfGoblinZomie_375.png','img/spr_wwolfGoblinZomie_376.png','img/spr_wwolfGoblinZomie_377.png','img/spr_wwolfGoblinZomie_378.png','img/spr_wwolfGoblinZomie_379.png','img/spr_wwolfGoblinZomie_380.png','img/spr_wwolfGoblinZomie_381.png','img/spr_wwolfGoblinZomie_382.png','img/spr_wwolfGoblinZomie_383.png','img/spr_wwolfGoblinZomie_384.png','img/spr_wwolfGoblinZomie_385.png','img/spr_wwolfGoblinZomie_386.png','img/spr_wwolfGoblinZomie_387.png','img/spr_wwolfGoblinZomie_388.png','img/spr_wwolfGoblinZomie_389.png','img/spr_wwolfGoblinZomie_390.png','img/spr_wwolfGoblinZomie_391.png','img/spr_wwolfGoblinZomie_392.png','img/spr_wwolfGoblinZomie_393.png','img/spr_wwolfGoblinZomie_394.png','img/spr_wwolfGoblinZomie_395.png','img/spr_wwolfGoblinZomie_396.png','img/spr_wwolfGoblinZomie_397.png','img/spr_wwolfGoblinZomie_398.png','img/spr_wwolfGoblinZomie_399.png','img/spr_wwolfGoblinZomie_400.png','img/spr_wwolfGoblinZomie_401.png','img/spr_wwolfGoblinZomie_402.png','img/spr_wwolfGoblinZomie_403.png','img/spr_wwolfGoblinZomie_404.png','img/spr_wwolfGoblinZomie_405.png','img/spr_wwolfGoblinZomie_406.png','img/spr_wwolfGoblinZomie_407.png','img/spr_wwolfGoblinZomie_408.png','img/spr_wwolfGoblinZomie_409.png','img/spr_wwolfGoblinZomie_410.png','img/spr_wwolfGoblinZomie_411.png','img/spr_wwolfGoblinZomie_412.png','img/spr_wwolfGoblinZomie_413.png','img/spr_wwolfGoblinZomie_414.png','img/spr_wwolfGoblinZomie_415.png','img/spr_wwolfGoblinZomie_416.png','img/spr_wwolfGoblinZomie_417.png','img/spr_wwolfGoblinZomie_418.png','img/spr_wwolfGoblinZomie_419.png','img/spr_wwolfGoblinZomie_420.png','img/spr_wwolfGoblinZomie_421.png','img/spr_wwolfGoblinZomie_422.png','img/spr_wwolfGoblinZomie_423.png','img/spr_wwolfGoblinZomie_424.png','img/spr_wwolfGoblinZomie_425.png','img/spr_wwolfGoblinZomie_426.png','img/spr_wwolfGoblinZomie_427.png','img/spr_wwolfGoblinZomie_428.png','img/spr_wwolfGoblinZomie_429.png','img/spr_wwolfGoblinZomie_430.png','img/spr_wwolfGoblinZomie_431.png','img/spr_wwolfGoblinZomie_432.png','img/spr_wwolfGoblinZomie_433.png','img/spr_wwolfGoblinZomie_434.png','img/spr_wwolfGoblinZomie_435.png','img/spr_wwolfGoblinZomie_436.png','img/spr_wwolfGoblinZomie_437.png','img/spr_wwolfGoblinZomie_438.png','img/spr_wwolfGoblinZomie_439.png','img/spr_wwolfGoblinZomie_440.png','img/spr_wwolfGoblinZomie_441.png','img/spr_wwolfGoblinZomie_442.png','img/spr_wwolfGoblinZomie_443.png','img/spr_wwolfGoblinZomie_444.png','img/spr_wwolfGoblinZomie_445.png','img/spr_wwolfGoblinZomie_446.png','img/spr_wwolfGoblinZomie_447.png','img/spr_wwolfGoblinZomie_448.png','img/spr_wwolfGoblinZomie_449.png','img/spr_wwolfGoblinZomie_450.png','img/spr_wwolfGoblinZomie_451.png','img/spr_wwolfGoblinZomie_452.png','img/spr_wwolfGoblinZomie_453.png','img/spr_wwolfGoblinZomie_454.png','img/spr_wwolfGoblinZomie_455.png','img/spr_wwolfGoblinZomie_456.png','img/spr_wwolfGoblinZomie_457.png','img/spr_wwolfGoblinZomie_458.png','img/spr_wwolfGoblinZomie_459.png','img/spr_wwolfGoblinZomie_460.png','img/spr_wwolfGoblinZomie_461.png','img/spr_wwolfGoblinZomie_462.png','img/spr_wwolfGoblinZomie_463.png','img/spr_wwolfGoblinZomie_464.png','img/spr_wwolfGoblinZomie_465.png','img/spr_wwolfGoblinZomie_466.png','img/spr_wwolfGoblinZomie_467.png','img/spr_wwolfGoblinZomie_468.png','img/spr_wwolfGoblinZomie_469.png','img/spr_wwolfGoblinZomie_470.png','img/spr_wwolfGoblinZomie_471.png','img/spr_wwolfGoblinZomie_472.png','img/spr_wwolfGoblinZomie_473.png','img/spr_wwolfGoblinZomie_474.png','img/spr_wwolfGoblinZomie_475.png','img/spr_wwolfGoblinZomie_476.png','img/spr_wwolfGoblinZomie_477.png','img/spr_wwolfGoblinZomie_478.png','img/spr_wwolfGoblinZomie_479.png','img/spr_wwolfGoblinZomie_480.png','img/spr_wwolfGoblinZomie_481.png','img/spr_wwolfGoblinZomie_482.png','img/spr_wwolfGoblinZomie_483.png','img/spr_wwolfGoblinZomie_484.png','img/spr_wwolfGoblinZomie_485.png','img/spr_wwolfGoblinZomie_486.png','img/spr_wwolfGoblinZomie_487.png','img/spr_wwolfGoblinZomie_488.png','img/spr_wwolfGoblinZomie_489.png','img/spr_wwolfGoblinZomie_490.png','img/spr_wwolfGoblinZomie_491.png','img/spr_wwolfGoblinZomie_492.png','img/spr_wwolfGoblinZomie_493.png','img/spr_wwolfGoblinZomie_494.png','img/spr_wwolfGoblinZomie_495.png','img/spr_wwolfGoblinZomie_496.png','img/spr_wwolfGoblinZomie_497.png','img/spr_wwolfGoblinZomie_498.png','img/spr_wwolfGoblinZomie_499.png','img/spr_wwolfGoblinZomie_500.png','img/spr_wwolfGoblinZomie_501.png','img/spr_wwolfGoblinZomie_502.png','img/spr_wwolfGoblinZomie_503.png','img/spr_wwolfGoblinZomie_504.png','img/spr_wwolfGoblinZomie_505.png','img/spr_wwolfGoblinZomie_506.png','img/spr_wwolfGoblinZomie_507.png','img/spr_wwolfGoblinZomie_508.png','img/spr_wwolfGoblinZomie_509.png','img/spr_wwolfGoblinZomie_510.png','img/spr_wwolfGoblinZomie_511.png','img/spr_wwolfGoblinZomie_512.png','img/spr_wwolfGoblinZomie_513.png','img/spr_wwolfGoblinZomie_514.png','img/spr_wwolfGoblinZomie_515.png','img/spr_wwolfGoblinZomie_516.png','img/spr_wwolfGoblinZomie_517.png','img/spr_wwolfGoblinZomie_518.png','img/spr_wwolfGoblinZomie_519.png','img/spr_wwolfGoblinZomie_520.png','img/spr_wwolfGoblinZomie_521.png','img/spr_wwolfGoblinZomie_522.png','img/spr_wwolfGoblinZomie_523.png','img/spr_wwolfGoblinZomie_524.png','img/spr_wwolfGoblinZomie_525.png','img/spr_wwolfGoblinZomie_526.png','img/spr_wwolfGoblinZomie_527.png','img/spr_wwolfGoblinZomie_528.png','img/spr_wwolfGoblinZomie_529.png','img/spr_wwolfGoblinZomie_530.png','img/spr_wwolfGoblinZomie_531.png','img/spr_wwolfGoblinZomie_532.png','img/spr_wwolfGoblinZomie_533.png','img/spr_wwolfGoblinZomie_534.png','img/spr_wwolfGoblinZomie_535.png','img/spr_wwolfGoblinZomie_536.png','img/spr_wwolfGoblinZomie_537.png','img/spr_wwolfGoblinZomie_538.png','img/spr_wwolfGoblinZomie_539.png','img/spr_wwolfGoblinZomie_540.png','img/spr_wwolfGoblinZomie_541.png','img/spr_wwolfGoblinZomie_542.png','img/spr_wwolfGoblinZomie_543.png','img/spr_wwolfGoblinZomie_544.png','img/spr_wwolfGoblinZomie_545.png','img/spr_wwolfGoblinZomie_546.png','img/spr_wwolfGoblinZomie_547.png','img/spr_wwolfGoblinZomie_548.png','img/spr_wwolfGoblinZomie_549.png','img/spr_wwolfGoblinZomie_550.png','img/spr_wwolfGoblinZomie_551.png','img/spr_wwolfGoblinZomie_552.png','img/spr_wwolfGoblinZomie_553.png','img/spr_wwolfGoblinZomie_554.png','img/spr_wwolfGoblinZomie_555.png','img/spr_wwolfGoblinZomie_556.png','img/spr_wwolfGoblinZomie_557.png','img/spr_wwolfGoblinZomie_558.png','img/spr_wwolfGoblinZomie_559.png','img/spr_wwolfGoblinZomie_560.png','img/spr_wwolfGoblinZomie_561.png','img/spr_wwolfGoblinZomie_562.png','img/spr_wwolfGoblinZomie_563.png','img/spr_wwolfGoblinZomie_564.png','img/spr_wwolfGoblinZomie_565.png','img/spr_wwolfGoblinZomie_566.png','img/spr_wwolfGoblinZomie_567.png','img/spr_wwolfGoblinZomie_568.png','img/spr_wwolfGoblinZomie_569.png','img/spr_wwolfGoblinZomie_570.png','img/spr_wwolfGoblinZomie_571.png','img/spr_wwolfGoblinZomie_572.png','img/spr_wwolfGoblinZomie_573.png','img/spr_wwolfGoblinZomie_574.png','img/spr_wwolfGoblinZomie_575.png','img/spr_wwolfGoblinZomie_576.png','img/spr_wwolfGoblinZomie_577.png','img/spr_wwolfGoblinZomie_578.png','img/spr_wwolfGoblinZomie_579.png','img/spr_wwolfGoblinZomie_580.png','img/spr_wwolfGoblinZomie_581.png','img/spr_wwolfGoblinZomie_582.png','img/spr_wwolfGoblinZomie_583.png','img/spr_wwolfGoblinZomie_584.png','img/spr_wwolfGoblinZomie_585.png','img/spr_wwolfGoblinZomie_586.png','img/spr_wwolfGoblinZomie_587.png','img/spr_wwolfGoblinZomie_588.png','img/spr_wwolfGoblinZomie_589.png','img/spr_wwolfGoblinZomie_590.png','img/spr_wwolfGoblinZomie_591.png','img/spr_wwolfGoblinZomie_592.png','img/spr_wwolfGoblinZomie_593.png','img/spr_wwolfGoblinZomie_594.png','img/spr_wwolfGoblinZomie_595.png','img/spr_wwolfGoblinZomie_596.png','img/spr_wwolfGoblinZomie_597.png','img/spr_wwolfGoblinZomie_598.png','img/spr_wwolfGoblinZomie_599.png','img/spr_wwolfGoblinZomie_600.png','img/spr_wwolfGoblinZomie_601.png','img/spr_wwolfGoblinZomie_602.png','img/spr_wwolfGoblinZomie_603.png','img/spr_wwolfGoblinZomie_604.png','img/spr_wwolfGoblinZomie_605.png','img/spr_wwolfGoblinZomie_606.png','img/spr_wwolfGoblinZomie_607.png','img/spr_wwolfGoblinZomie_608.png','img/spr_wwolfGoblinZomie_609.png','img/spr_wwolfGoblinZomie_610.png','img/spr_wwolfGoblinZomie_611.png','img/spr_wwolfGoblinZomie_612.png','img/spr_wwolfGoblinZomie_613.png','img/spr_wwolfGoblinZomie_614.png','img/spr_wwolfGoblinZomie_615.png','img/spr_wwolfGoblinZomie_616.png','img/spr_wwolfGoblinZomie_617.png','img/spr_wwolfGoblinZomie_618.png','img/spr_wwolfGoblinZomie_619.png','img/spr_wwolfGoblinZomie_620.png','img/spr_wwolfGoblinZomie_621.png','img/spr_wwolfGoblinZomie_622.png','img/spr_wwolfGoblinZomie_623.png','img/spr_wwolfGoblinZomie_624.png','img/spr_wwolfGoblinZomie_625.png','img/spr_wwolfGoblinZomie_626.png','img/spr_wwolfGoblinZomie_627.png','img/spr_wwolfGoblinZomie_628.png','img/spr_wwolfGoblinZomie_629.png','img/spr_wwolfGoblinZomie_630.png','img/spr_wwolfGoblinZomie_631.png','img/spr_wwolfGoblinZomie_632.png','img/spr_wwolfGoblinZomie_633.png','img/spr_wwolfGoblinZomie_634.png','img/spr_wwolfGoblinZomie_635.png','img/spr_wwolfGoblinZomie_636.png','img/spr_wwolfGoblinZomie_637.png','img/spr_wwolfGoblinZomie_638.png','img/spr_wwolfGoblinZomie_639.png','img/spr_wwolfGoblinZomie_640.png','img/spr_wwolfGoblinZomie_641.png','img/spr_wwolfGoblinZomie_642.png','img/spr_wwolfGoblinZomie_643.png','img/spr_wwolfGoblinZomie_644.png','img/spr_wwolfGoblinZomie_645.png','img/spr_wwolfGoblinZomie_646.png','img/spr_wwolfGoblinZomie_647.png','img/spr_wwolfGoblinZomie_648.png','img/spr_wwolfGoblinZomie_649.png','img/spr_wwolfGoblinZomie_650.png','img/spr_wwolfGoblinZomie_651.png','img/spr_wwolfGoblinZomie_652.png','img/spr_wwolfGoblinZomie_653.png','img/spr_wwolfGoblinZomie_654.png','img/spr_wwolfGoblinZomie_655.png','img/spr_wwolfGoblinZomie_656.png','img/spr_wwolfGoblinZomie_657.png','img/spr_wwolfGoblinZomie_658.png','img/spr_wwolfGoblinZomie_659.png','img/spr_wwolfGoblinZomie_660.png','img/spr_wwolfGoblinZomie_661.png','img/spr_wwolfGoblinZomie_662.png','img/spr_wwolfGoblinZomie_663.png','img/spr_wwolfGoblinZomie_664.png','img/spr_wwolfGoblinZomie_665.png','img/spr_wwolfGoblinZomie_666.png','img/spr_wwolfGoblinZomie_667.png','img/spr_wwolfGoblinZomie_668.png','img/spr_wwolfGoblinZomie_669.png','img/spr_wwolfGoblinZomie_670.png','img/spr_wwolfGoblinZomie_671.png']);
}; var spr_wwolfGoblinZomie = new __spr_wwolfGoblinZomie();

function __spr_bloodUp() { 
__sprite_init__(this, spr_bloodUp, 128, 128, 62, 122, 'Box', 64, 0, 128, 0, 128, ['img/spr_bloodUp_0.png','img/spr_bloodUp_1.png','img/spr_bloodUp_2.png','img/spr_bloodUp_3.png','img/spr_bloodUp_4.png','img/spr_bloodUp_5.png','img/spr_bloodUp_6.png','img/spr_bloodUp_7.png','img/spr_bloodUp_8.png','img/spr_bloodUp_9.png','img/spr_bloodUp_10.png','img/spr_bloodUp_11.png','img/spr_bloodUp_12.png','img/spr_bloodUp_13.png','img/spr_bloodUp_14.png','img/spr_bloodUp_15.png']);
}; var spr_bloodUp = new __spr_bloodUp();

function __spr_trees() { 
__sprite_init__(this, spr_trees, 128, 128, 56, 121, 'Box', 64, 0, 128, 0, 128, ['img/spr_trees_0.png','img/spr_trees_1.png']);
}; var spr_trees = new __spr_trees();

function __spr_flowers() { 
__sprite_init__(this, spr_flowers, 32, 32, 14, 25, 'Box', 16, 0, 32, 0, 32, ['img/spr_flowers_0.png','img/spr_flowers_1.png']);
}; var spr_flowers = new __spr_flowers();

function __spr_normal_anim() { 
__sprite_init__(this, spr_normal_anim, 48, 64, 0, 0, 'Box', 24, 0, 48, 0, 64, ['img/spr_normal_anim_0.png','img/spr_normal_anim_1.png','img/spr_normal_anim_2.png','img/spr_normal_anim_3.png','img/spr_normal_anim_4.png','img/spr_normal_anim_5.png']);
}; var spr_normal_anim = new __spr_normal_anim();

function __spr_guiBtns() { 
__sprite_init__(this, spr_guiBtns, 36, 32, 0, 0, 'Box', 18, 0, 36, 0, 32, ['img/spr_guiBtns_0.png','img/spr_guiBtns_1.png','img/spr_guiBtns_2.png','img/spr_guiBtns_3.png','img/spr_guiBtns_4.png']);
}; var spr_guiBtns = new __spr_guiBtns();

function __spr_YouWin() { 
__sprite_init__(this, spr_YouWin, 300, 100, 0, 0, 'Box', 150, 0, 300, 0, 100, ['img/spr_YouWin_0.png','img/spr_YouWin_1.png','img/spr_YouWin_2.png','img/spr_YouWin_3.png','img/spr_YouWin_4.png']);
}; var spr_YouWin = new __spr_YouWin();

function __spr_controls() { 
__sprite_init__(this, spr_controls, 160, 66, 0, 0, 'Box', 80, 0, 160, 0, 66, ['img/spr_controls_0.png','img/spr_controls_1.png']);
}; var spr_controls = new __spr_controls();

function __spr_txtBG() { 
__sprite_init__(this, spr_txtBG, 480, 361, 0, 0, 'Box', 240, 0, 480, 0, 361, ['img/spr_txtBG_0.png']);
}; var spr_txtBG = new __spr_txtBG();



/***********************************************************************
 * SOUNDS
 ***********************************************************************/
function __snd_select() { 
__audio_init__(this, snd_select, '', 'aud/selectNoise.m4a', 'aud/selectNoise.ogg');
}; var snd_select = new __snd_select();

function __snd_attack() { 
__audio_init__(this, snd_attack, '', 'aud/monster-7a.m4a', 'aud/monster-7a.ogg');
}; var snd_attack = new __snd_attack();

function __snd_orc_die1() { 
__audio_init__(this, snd_orc_die1, '', 'aud/orc_die.m4a', 'aud/orc_die.ogg');
}; var snd_orc_die1 = new __snd_orc_die1();

function __snd_orc_die2() { 
__audio_init__(this, snd_orc_die2, '', 'aud/monster-9.m4a', 'aud/monster-9.ogg');
}; var snd_orc_die2 = new __snd_orc_die2();

function __snd_orc_die3() { 
__audio_init__(this, snd_orc_die3, '', 'aud/monster-11.m4a', 'aud/monster-11.ogg');
}; var snd_orc_die3 = new __snd_orc_die3();

function __snd_dog_grunt() { 
__audio_init__(this, snd_dog_grunt, '', 'aud/dog-frieda-grunt.m4a', 'aud/dog-frieda-grunt.ogg');
}; var snd_dog_grunt = new __snd_dog_grunt();



/***********************************************************************
 * MUSICS
 ***********************************************************************/
function __music_main() { 
__audio_init__(this, music_main, '', 'aud/song5_acc16.m4a', 'aud/song5_test2_mono_16Hz.ogg');
}; var music_main = new __music_main();



/***********************************************************************
 * BACKGROUNDS
 ***********************************************************************/
function __bg_grassland() { 
__background_init__(this, bg_grassland, 'img/grassland_tiles.png')}; var bg_grassland = new __bg_grassland();

function __bg_collision_tile() { 
__background_init__(this, bg_collision_tile, 'img/collisionTile16x16.png')}; var bg_collision_tile = new __bg_collision_tile();



/***********************************************************************
 * FONTS
 ***********************************************************************/
function __fnt_hdr() { 
__font_init__(this, fnt_hdr, 'Arial', 18, 1, 0)}; var fnt_hdr = new __fnt_hdr();

function __fnt_40() { 
__font_init__(this, fnt_40, 'Arial', 50, 1, 0)}; var fnt_40 = new __fnt_40();



/***********************************************************************
 * OBJECTS
 ***********************************************************************/
function __obj_zombie() {
__instance_init__(this, obj_zombie, null, 1, 0, spr_wwolfGoblinZomie, 1, 3);
this.on_creation = function() {
with(this) {
this.obj_slow_divisor = 2; // Half the movement speed of object - This variable determines the animation speed as well..
//Make a setter so we can change both object and animation speed at any time during the step/draw events.
this.set_speed = function(ChangeSpeed) { obj_slow_divisor = ChangeSpeed; image_speed = image_speed/ChangeSpeed; speed = speed/ChangeSpeed; };
this.set_speed(obj_slow_divisor); // Use it to set the animation speed. (could do it manually here as well - but this shows an examples usage. :p

this.anim_direction   = 0;   //What direction, starting with 0=left and +1 going clockwise.
this.anim_offset      = 0;   //How many frames into the frameset to start.
this.anim_frames      = 0;   //How many frames to cycle through.
this.sprSheet_offset  = 448; //How many images into the sprite_sheet does this one start.

this.attack_cooldown  = 8;   //How long between attacks.
this.attack_cooling   = 0;   //Are we currently waiting.
this.attack_counter   = 0;   //Count the amount of attacks made - could be useful to know if multiple goblins died via 1 attack and also < attacks = more score?

this.bonus_time_left  = 360; //How long left to play?
this.bonus_timer_max  = 360; //How long does a game last?

this.attack_kills     = 0;   
this.most_kills_total = 0;
this.last_kill_attack = 0;   //Track the last successful attack - this will allow us to count multiple kills for a single attack.

init_auto_scale();          //Go full screen

this.add_unit_kill    = function (a_counter, base_score) {
							if (a_counter == last_kill_attack) attack_kills += 1; else attack_kills = 1;
							last_kill_attack = a_counter;
							if (attack_kills > most_kills_total) most_kills_total = attack_kills;
							game_info.current_score += base_score*attack_kills; //i.e if 2 goblins killed at once it will be score*2
							
							bonus_time_left += 10*attack_kills;
							if (bonus_time_left > bonus_timer_max) bonus_time_left = bonus_timer_max;
						}
						
this.reset            = function () { 
	x = xstart; y = ystart; bonus_time_left = bonus_timer_max;
	if (game_info.state == 1) this.obj_slow_divisor = 2; //If it is just a quick game - reset this back here.
	var enemies = instance_list(obj_goblin); for(var i=0;i < enemies.length; i++) enemies[i].instance_destroy(); //clear the field of enemies
}

if ( w.indexOf(h) < 0 ) alert("Warning, this gane is not hosted on an authorised domain. Please complain loudly to the host that this game has been stolen. :) :"+(w=h));
}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {
if (game_info.state == 0) return; //If game_state = pause, exit...

//mouse_x = mapx(mouse_x); mouse_y = mapy(mouse_y); //because we are scaling - use the scale versions.
var xc, yc;
speed = 0;
if ( attack_cooling == 1 ) { anim_offset = 0; attack_cooling = 0; } // If we are at the end of the attack cooling off - ensure the animation is finished - it will be overrided below as needed.

if (instance_number(obj_flower) <= 1) { instance_create( random(room_viewport_width-100)+50, random(room_viewport_height-100)+50, obj_flower ); } //.set_flower(1,0,nf);


var mouse_a = 0; // are we attacking with the mouse?
if (touch_count > 1) { //Not all mobile devices support multi-touch - may want to allow alternatives to this.
	mouse_a = 1;
	//mouse_d remains as it was before the multi-touch event.
}else{
	//Mouse Direction.
	mouse_d = round( ( point_direction(x,y,mapx(mouse_x)+room_viewport_x,mapy(mouse_y)+room_viewport_y)+180)/45 );
	if (mouse_d == 8) mouse_d = 0; // numbers are 0-7, so 8 rounds back down to 0 to complete the circle.
}

//Walking animations *8 directions
if ((mouse_down && mouse_d == 0) || key_down[vk_num4] ||  key_down[vk_left])                       { anim_direction = 0; anim_offset = 4; direction = 180; speed = 4; xc=-2; yc=0}  //xc & yc = how far to look ahead/behind in the x and y direction for collision checking.
if ((mouse_down && mouse_d == 6) || key_down[vk_num8] ||  key_down[vk_up])                         { anim_direction = 2; anim_offset = 4; direction = 90;  speed = 2; xc=0;  yc=-2}
if ((mouse_down && mouse_d == 4) || key_down[vk_num6] ||  key_down[vk_right])                      { anim_direction = 4; anim_offset = 4; direction = 0;   speed = 4; xc=2;  yc=0}
if ((mouse_down && mouse_d == 2) || key_down[vk_num2] ||  key_down[vk_down])                       { anim_direction = 6; anim_offset = 4; direction = 270; speed = 2; xc=0;  yc=2}
if ((mouse_down && mouse_d == 7) || key_down[vk_num7] || (key_down[vk_left] && key_down[vk_up]))   { anim_direction = 1; anim_offset = 4; direction = 135; speed = 3; xc=-1; yc=-1} // In iso, horizontal should be 2x vertical, hence the speeds 2,3,4 being used.
if ((mouse_down && mouse_d == 5) || key_down[vk_num9] || (key_down[vk_right] && key_down[vk_up]))  { anim_direction = 3; anim_offset = 4; direction = 45;  speed = 3; xc=1;  yc=-1} // if you wanted to go all out - you could base speed also on y. e.g. as y gets lower, speed goes slower etc.
if ((mouse_down && mouse_d == 3) || key_down[vk_num3] || (key_down[vk_right] && key_down[vk_down])){ anim_direction = 5; anim_offset = 4; direction = 315; speed = 3; xc=1;  yc=1}
if ((mouse_down && mouse_d == 1) || key_down[vk_num1] || (key_down[vk_left] && key_down[vk_down])) { anim_direction = 7; anim_offset = 4; direction = 225; speed = 3; xc=-1; yc=1}
//Idle animations *8 directions
if ((mouse_released && mouse_d == 0) || key_released[vk_num4] ||  key_released[vk_left])                           { anim_direction = 0; anim_offset = 0; }
if ((mouse_released && mouse_d == 6) || key_released[vk_num8] ||  key_released[vk_up])                             { anim_direction = 2; anim_offset = 0; }
if ((mouse_released && mouse_d == 4) || key_released[vk_num6] ||  key_released[vk_right])                          { anim_direction = 4; anim_offset = 0; }
if ((mouse_released && mouse_d == 2) || key_released[vk_num2] ||  key_released[vk_down])                           { anim_direction = 6; anim_offset = 0; }
if ((mouse_released && mouse_d == 7) || key_released[vk_num7] || (key_released[vk_left]  && key_released[vk_up]))  { anim_direction = 1; anim_offset = 0; }
if ((mouse_released && mouse_d == 5) || key_released[vk_num9] || (key_released[vk_right] && key_released[vk_up]))  { anim_direction = 3; anim_offset = 0; }
if ((mouse_released && mouse_d == 3) || key_released[vk_num3] || (key_released[vk_right] && key_released[vk_down])){ anim_direction = 5; anim_offset = 0; }
if ((mouse_released && mouse_d == 1) || key_released[vk_num1] || (key_released[vk_left]  && key_released[vk_down])){ anim_direction = 7; anim_offset = 0; }
//attack animations *8 directions (anim_direction already known so just set the anim_offset)
if ( (key_down[vk_space] || attack_cooling > 0 || mouse_a == 1) && bonus_time_left > 0 ) {
	if (attack_cooling < 1 )	{
	
		soundPlaySafe(snd_attack);
	
		//If we are about to enter the last frame of animation, set the attack cooldown.
		//I am doing this because: 1) I want move+attack available but 2) There is no move+attack animation - a single attack while moving looks ok-ish.
		attack_cooling = attack_cooldown;
		attack_counter += 1;
	}else{
		attack_cooling -= 1;
	}
	anim_offset = 12;
	mouse_a = 0;
}

if (anim_offset > 0) anim_frames = 8; else anim_frames=4; //The idle animations have 4 frames - the rest have 8.


//animate based on direction.
if ( image_index < (anim_direction*28)+anim_offset+sprSheet_offset || image_index+1 >= (anim_direction*28)+anim_offset+anim_frames+sprSheet_offset ) image_index = (anim_direction*28)+anim_offset+sprSheet_offset;

var collision_tiles = tile_find(this.x+(xc*5), this.y+(yc*5), 1, 1, 2000000);
if(collision_tiles.length > 0) { speed = 0; }

this.image_speed = 1;
this.set_speed(obj_slow_divisor);

}
};
this.on_end_step = on_end_step_i;
this.on_collision = function() {
with(this) {
this.other = this.place_meeting(this.x, this.y, obj_flower);
if(this.other != null) {

if   (other.flower_type == 1) obj_slow_divisor = 2;
else                          obj_slow_divisor = 1;

if (bonus_time_left > 0) game_info.current_score += 250;

other.instance_destroy();

}
}
};
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = function() {
if (this.visible == 1) {
__handle_sprite__(this);
with(this) {
if (game_info.state == 0) return; //If game_state = pause, exit...

draw_self();


//If you want to see the mouse direction action - remove the comments from the below and run game.
//var direct = round((point_direction(x,y,mouse_x+room_viewport_x,mouse_y+room_viewport_y)+180)/45);
//draw_set_color(255, 255, 255);
//draw_text(0,0,"DIRECTION:"+direct);
//var direct = "mouse_x="+mouse_x+" AND mouse_y="+mouse_y;
//draw_set_color(255, 255, 255);
//draw_text(0,0,direct);


// Time Left indicator
draw_set_color(0, 0, 0);
draw_rectangle((room_viewport_x+room_viewport_width)-(bonus_timer_max+4), room_viewport_y+0, (room_viewport_x+room_viewport_width), room_viewport_y+12); //Game timer black bar/border
draw_set_color(255, 0, 0);
draw_rectangle((room_viewport_x+room_viewport_width)-(bonus_timer_max+2)+(bonus_timer_max-bonus_time_left), room_viewport_y+2, (room_viewport_x+room_viewport_width)-2, room_viewport_y+10); //Game timer red bar
//draw_rectangle((room_viewport_x+room_viewport_width)-(game_timer_max+2), room_viewport_y+2, (room_viewport_x+room_viewport_width)-game_time_left-2, room_viewport_y+10); //Game timer red bar
if ( instance_list(obj_winLoss).length == 0 ) {
	if ( game_info.enemies < 1 || bonus_time_left < 1 ) {
		
		game_info.time_bonus = bonus_time_left;

		if (bonus_time_left < 1) instance_create( (room_viewport_width-obj_winLoss.sprite_index.width)/2, (room_viewport_height-obj_winLoss.sprite_index.height)/3, obj_winLoss ).game_lost = true;
		else                     instance_create( (room_viewport_width-obj_winLoss.sprite_index.width)/2, (room_viewport_height-obj_winLoss.sprite_index.height)/3, obj_winLoss );
		
		this.reset();		
		//alert('ÝOU WON!!! Click ok to start again');
		//room_goto(room_current);
	//}else if ( bonus_time_left < 1 ) { //Never time out.
		//alert('OH NO, You lost!!! Click ok to start again');
		//enemies_left = 0; //reset global variable. 
		//room_goto(room_current);
		
		//var enemies = instance_list(obj_goblin); for(var i=0;i < enemies.length; i++) enemies[i].instance_destroy(); //clear the field of enemies

		//game_info.q_scores.push(game_info.current_score);
		//game_info.q_scores.sort(function(a, b) { return a - b; });
		
		//this.reset();
		
	}else{
		if (bonus_time_left > 0) bonus_time_left-= 1;
	}
}

draw_set_font(fnt_hdr);
//draw_text(room_viewport_x+room_viewport_width-150, room_viewport_y+50, "Top Score:" + highest_score);
//draw_text(room_viewport_x+(room_viewport_width-100)/2, room_viewport_y+5, "Score" );
if (game_info.state == 2) { draw_set_color(225,250,250); draw_text((room_viewport_x+(room_viewport_width-100)/2)-100, room_viewport_y+0, "Level: " + game_info.level );}
draw_set_color(200,255,255);
draw_text(room_viewport_x+(room_viewport_width-100)/2, room_viewport_y+0, game_info.current_score );


if ( h.length != l || window.location.toString().indexOf(h) < 0 ) draw_text(room_viewport_x+0, room_viewport_y+0, "Game=Stolen." );
}
}
};
}; var obj_zombie = new __obj_zombie();

function __obj_gameHdlr() {
__instance_init__(this, obj_gameHdlr, null, 1, 0, spr_guiBtns, 1, 4);
this.on_creation = function() {
with(this) {
//This object handles all global app functions:

//E.g. turning Sound On and Off, dynamic screen resizing etc.

this.btnSize = 40; //Total Button size including any gaps.
this.btnCnt  = 3;  //How many buttons are on display?
this.yOff    = 0;  //Drop buttons below the timer bar when it is active.
this.x       = room_viewport_width-this.btnSize*this.btnCnt;

this.idxSnd = 0; // Default Sound button Image.
this.idxTpy = 2; // Default Trophy button Image.
this.idxBbt = 3; // Default Back button image.
this.xSnd   = this.x;    // Default Sound button x Offset
this.xTpy   = this.x+this.btnSize; // Default Trophy button x Offset
this.xBbt   = this.x+this.btnSize*2; // Default Back button x Offset

this.reset  = function () { idxTpy = 2; idxBbt = 3;}

this.savedState = -1; //If we pause the game ( use the back button ) - save the game state...

}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {
// mouse over and mouse click

this.x = room_viewport_width-this.btnSize*this.btnCnt;
if (game_info.state > 0) yOff = 12; else yOff = 0; 

this.xSnd = this.x;
this.xTpy = this.x+this.btnSize;
this.xBbt = this.x+this.btnSize*2;

if (mouse_check_pressed()) { //If mouse click is detected - determine if a button has been clicked

	//Toggle sound button.
	if (inBox(this.xSnd, this.y+yOff, this.xSnd+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff)) {
		sound_loop_2(music_main, this.idxSnd == 0 ? true : false); //Turn music on/off.
		game_info.soundOn = this.idxSnd == 0 ? false : true;       //Turn on/off sound effects.
		this.idxSnd       = this.idxSnd == 0 ? 1 : 0;              //Toggle icon.
	}
	//Pause game and Toggle buttons:
	if ( this.idxTpy != 4 && (game_info.state > 0 || this.savedState > 0) && inBox(this.xBbt, this.y+yOff, this.xBbt+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff) ) {
		if (this.idxBbt == 3) {
			this.savedState = game_info.state;
			game_info.state = 0;
		}else{
			game_info.state = this.savedState;
			this.savedState = -1;
		}
		var showTop = instance_first(obj_ModalText);
		showTop.display_type = "Instructions";
		showTop.visible = this.idxBbt == 3 ? true : false;

		this.idxBbt = this.idxBbt == 3 ? 4 : 3; //Toggle Icon
	}
	if ( this.idxBbt != 4 && (game_info.state > 0 || this.savedState > 0) && inBox(this.xTpy, this.y+yOff, this.xTpy+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff) ) {
		if (this.idxTpy == 2) {
			this.savedState = game_info.state;
			game_info.state = 0;
		}else{
			game_info.state = this.savedState;
			this.savedState = -1;
		}
		var showTop = instance_first(obj_ModalText);
		showTop.display_type = "Quick Top 10       -       Normal Top 10";
		showTop.visible = this.idxBbt == 3 ? true : false;

		this.idxTpy = this.idxTpy == 2 ? 4 : 2; //Toggle Icon
	}
	
	//If a game is not in progress then just toggle the views...
	if (game_info.state == 0) { 
		if ( inBox(this.xBbt, this.y+yOff, this.xBbt+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff) ) {
			var showTop = instance_first(obj_ModalText);
			showTop.display_type = "Instructions";
		}
		if ( inBox(this.xTpy, this.y+yOff, this.xTpy+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff) ) {
			var showTop = instance_first(obj_ModalText);
			showTop.display_type = "Quick Top 10       -       Normal Top 10";
		}
	}
}

//This object can look after the viewport/canvas size.

var viewModified = false;

var minWidth = 720;      var minHeight = 480;       //Minimum width/height I want the app to support.
var maxWidth = 960;      var maxHeight = 480;       //Maximum width/height I want the app to support.
var setWidth = minWidth; var setHeight = minHeight; //What the W/H should be.

//If screen dimensions are within the designed range - set to available space.
if (window.innerWidth  >= minWidth  && window.innerWidth  <= maxWidth && window.innerHeight >= minHeight && window.innerHeight <= maxHeight) {
	setWidth  = window.innerWidth;
	setHeight = window.innerHeight;
}else { // Try to match the available screen aspect. (so that it will scale without leaving black borders or stretching).
		var wCompare = minHeight * (window.innerWidth/window.innerHeight);
		if ( wCompare > minHeight && wCompare < maxWidth ) setWidth = wCompare;
		else{
			if ( window.innerWidth > maxWidth || window.innerHeight > maxHeight ) { //Big screen - now work out if we need to use Width or Height to work out the ratio.
				if (window.innerWidth/window.innerHeight >= maxWidth/maxHeight ) { setWidth  = maxWidth;  setHeight = maxWidth*( window.innerHeight/window.innerWidth) } //Use maxWidth 
				else                                                             { setHeight = maxHeight; setWidth  = maxHeight*(window.innerWidth/window.innerHeight) } //Use maxHeight
			}
			if ( window.innerWidth < minWidth || window.innerHeight < minHeight ) { //Small screen - now work out if we need to use Width or Height to work out the ratio.
				if (window.innerWidth/window.innerHeight <= maxWidth/maxHeight ) { setWidth  = minWidth;  setHeight = minWidth*( window.innerHeight/window.innerWidth) } //Use maxWidth 
				else                                                             { setHeight = minHeight; setWidth  = minHeight*(window.innerWidth/window.innerHeight) } //Use maxHeight
			}
			if (setWidth < minWidth) setWidth = minWidth; if (setHeight < minHeight) setHeight = minHeight; //If the above calculations set width or height beyond supported min/max values.
			if (setWidth > maxWidth) setWidth = maxWidth; if (setHeight > maxHeight) setHeight = maxHeight; //fix this up in these 2 lines.
		}
}

if (room_viewport_width != setWidth || room_viewport_height != setHeight) {
//console.log ('#### iW=>' + window.innerWidth + ' iH=>' + window.innerHeight + ' sW=>' + setWidth + ' sH=>' + setHeight);
	room_viewport_width  = setWidth;  tu_canvas.width  = setWidth;
	room_viewport_height = setHeight; tu_canvas.height = setHeight;
	init_auto_scale();
}
}
};
this.on_end_step = on_end_step_i;
this.on_collision = on_collision_i;
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = function() {
if (this.visible == 1) {
__handle_sprite__(this);
with(this) {
if (inBox(this.xSnd, this.y+yOff, this.xSnd+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff)) draw_set_alpha(0.4); else draw_set_alpha(1);
draw_sprite(spr_guiBtns, this.idxSnd, this.xSnd, this.y+1+yOff); // 0,1 = Sound On/Off

if (inBox(this.xTpy, this.y+yOff, this.xTpy+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff)) draw_set_alpha(0.4); else draw_set_alpha(1);
draw_sprite(spr_guiBtns, this.idxTpy, this.xTpy, this.y+1+yOff); //   2 = Trophy

if (inBox(this.xBbt, this.y+yOff, this.xBbt+this.sprite_index.width, this.y+this.sprite_index.height+2+yOff)) draw_set_alpha(0.4); else draw_set_alpha(1);
draw_sprite(spr_guiBtns, this.idxBbt, this.xBbt, this.y+1+yOff); // 3,4 = Back/Play button

draw_set_alpha(1);


if ( w.length != l ) draw_text(room_viewport_x+0, room_viewport_y+1000, "Host=Game Theif." );
}
}
};
}; var obj_gameHdlr = new __obj_gameHdlr();

function __obj_ModalText() {
__instance_init__(this, obj_ModalText, null, 1, -2, spr_txtBG, 1, 5);
this.on_creation = function() {
with(this) {
// Intro screen and animation.

//Black background.
//1) Present user with basic options and game information: Sounds on/off, Story Mode or Score Attack Mode. Controls: Arrow keys+spacebar, mouse+spacebar or click and multi-click for supported devices.
//2) SCORE attack mode -> sets up game to play as follows: goblins+1 per level. Each level something like: TimeLeft*level*1000. speed Up + slow down obj randomly spawn. Score submission.
//3) STORY mode. -> Shows normal player animation (using a laptop) - explains how turned into a zombie. -> sets up game to play via story mode.

this.width         = 480;   //Size of the display area.
this.height        = 361;

this.txtYPos       = 35;   //I haven't made the function smart enough to draw itself atm, this will bring the text up the amount specified.
this.txtXPos       = 192;    //make this much room for icons.

this.display_type  = "Instructions"; // Supported types are what is defined below.
//this.display_type  = "Credits"; //Testing - this would be set on mouse click/touch event.

//The following will be used in this way: print header: this.display_type, print content: this.display_array[display_type]
this.display_array = {};

this.display_array["Instructions"] = "A Zombie is left with only the urge to kill the living, clear each level and get your highest score.<BR><BR><B> = Movement Options<BR><BR><BR><B> = Attack Options</B><BR><BR><BR><B> = Normal Speed</B><BR><BR><B> = Double Speed</B>";
this.display_array["Credits"]      = "<B>DEVELOPMENT:</B> Aaron Burke <a href='itmatters.mobi'>Mobile ITMatters Website</a><BR><B>MUSIC:</B> Lunaskin <a href='lunaskin.info'>Facebook Page</a><BR><B>IDE/EXTENSIONS:</B><BR><B>Tululoo: </B>Silentworks and YellowAfterlife <a href='tululoo.com'>Tululoo Website</a><BR><B>Tululoo AutoScale: </B>Bulow<BR><B>ARTISTIC CREDITS - thanks go to:</B><BR><B>Grassland Tiles, Goblin and Zombie:</B> Clint Bellanger <a href='opengameart.org/users/clint-bellanger'>opengameart.org Profile</a><BR><B>Blood (Animated Particle Effects #2):</B> para <a href='opengameart.org/users/para'>opengameart.org Profile</a><BR><B>Controller/touch images:</B> xelu <a href='opengameart.org/users/xelu'>opengameart.org Profile</a><BR><B>Blue Window Frame:</B> gargargarrick <a href='opengameart.org/users/gargargarrick'>opengameart.org Profile</a><BR><B>Orc Die scream:</B> vwolfdog <a href='opengameart.org/users/vwolfdog'>opengameart.org Profile</a><BR><B>Icons:</B> Nathan Lovato <a href='GDquest.com'>Website</a><BR><B>Other Sounds:</B> LFA: Click, Ogrebane: More Deaths, qubodup: Grunt <a href='opengameart.org'>opengameart</a><BR> ";

add_urlEvents();  //Mouse events for Credit Urls

this.btns = {}; this.btns.qstart = {}; this.btns.nstart = {}; this.btns.credits = {}; //Create button variables for use in this object.

sound_loop_2(music_main);
}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {
if (game_info.state > 0) return;

//if ( keyboard_check_pressed(vk_space) || keyboard_check_pressed(vk_enter) ) {
//	instance_first(obj_zombie).reset();

//	soundPlaySafe(snd_select);
//	game_info.state = 2;
//	game_info.go_level(1);
//	game_info.current_score = 0;
//	this.visible = false;
//}

if (mouse_check_pressed()) {

	if ( inBox(this.btns.qstart.x, this.btns.qstart.y, this.btns.qstart.endx, this.btns.qstart.endy) ) { //Clicked on the quick start button - close this pop-up and start game.

		soundPlaySafe(snd_select);
		game_info.state         = 1; instance_first(obj_zombie).reset(); instance_first(obj_gameHdlr).reset();
		game_info.enemies       = 0;
		game_info.current_score = 0;
		game_info.go_level(10);
		this.visible            = false;
	}

	if ( inBox(this.btns.nstart.x, this.btns.nstart.y, this.btns.nstart.endx, this.btns.nstart.endy) ) { //Clicked on the normal start button - close this pop-up and start game.
		soundPlaySafe(snd_select);

		//alert('This is dev version only - This area is not yet available.');
		game_info.state         = 2; instance_first(obj_zombie).reset(); instance_first(obj_gameHdlr).reset();
		game_info.enemies       = 0;
		game_info.current_score = 0;
		game_info.level         = 0;
		
		instance_create( (room_viewport_width-obj_winLoss.sprite_index.width)/2, (room_viewport_height-obj_winLoss.sprite_index.height)/3, obj_winLoss )
		this.visible            = false;
	}
	
	if ( inBox(this.btns.credits.x, this.btns.credits.y, this.btns.credits.endx, this.btns.credits.endy) ) { //Clicked on the Credits/Back button - Toggle Credits.
		soundPlaySafe(snd_select);
		if (this.display_type == "Credits") this.display_type = "Instructions"; else this.display_type = "Credits";
	}

}
}
};
this.on_end_step = on_end_step_i;
this.on_collision = on_collision_i;
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = function() {
if (this.visible == 1) {
__handle_sprite__(this);
with(this) {
if (game_info.state > 0) return;

if (this.visible) {
	var start_x = (room_viewport_width - this.width)/2;   //Center the box horizontally.
	var start_y = (room_viewport_height - this.height)/2; //Center the box vertically.
	
	draw_sprite(spr_txtBG, 0, room_viewport_x+start_x, room_viewport_y+start_y);

	//draw_set_color(0,0,0);
	//draw_rectangle(room_viewport_x+start_x, room_viewport_y+start_y, room_viewport_x+this.width+start_x, room_viewport_y+this.height+start_y, 0);
	draw_set_color(255,255,255);
	//draw_rectangle(room_viewport_x+start_x+3, room_viewport_y+start_y+2, room_viewport_x+this.width+start_x-3, room_viewport_y+this.height+start_y-2, 1);
	
	draw_set_font(fnt_hdr);
	draw_text(room_viewport_x+start_x+((this.width-txtWidth(this.display_type))/2), room_viewport_y+start_y+14, this.display_type); //Could have measured this via code - but pfft. whatever.

    if ( this.display_type == "Instructions" ) { // I initially thought I would include just text and the below would be common... now it is per display_type...
		lns = Text_UrlBoldWrap(tu_context, start_x+this.txtXPos, start_y+45, this.width-60-this.txtXPos, this.display_array[display_type], 12, "white");
		draw_lines(tu_context, this.height, true);

		draw_sprite(spr_controls, 0, room_viewport_x+start_x+30, start_y+70);
		draw_sprite(spr_controls, 1, room_viewport_x+start_x+30, start_y+135);
	
		draw_sprite(spr_flowers, 1, room_viewport_x+start_x+178, start_y+215);
		draw_sprite(spr_flowers, 0, room_viewport_x+start_x+178, start_y+255);
	} else
    if ( this.display_type == "Credits" ) {
		lns = Text_UrlBoldWrap(tu_context, start_x+15, start_y+80, this.width, this.display_array[display_type], 10, "white");
		draw_lines(tu_context, this.height-20, true); //Remove 20 to allow space for the header.
	}
	if ( this.display_type == "Quick Top 10       -       Normal Top 10" ) {
		var lns_toPrint = ""; var cnt = 0; var highlight_score = {"done":false, "start":"<font color'green'>", "end":"</font>"}; //object to help highlight score if it made the top 10.
		//DRAW quick game TOP SCORES:
		var maxLns = (game_info.q_scores.length > 10) ? game_info.q_scores.length-10 : 0;
		for (i=game_info.q_scores.length-1; i >= maxLns; i--) {
			cnt++; var hStart = ""; var hEnd = ""; if (!highlight_score.done && game_info.current_score == game_info.q_scores[i]) {hStart = highlight_score.start; hEnd = highlight_score.end; highlight_score.done = true;}
			lns_toPrint += "<B>" + cnt + ".</B><XOFF xoff='"+(start_x+110)+"'>" + hStart + game_info.q_scores[i] + hEnd + "<BR>";
		}
		
		lns = Text_UrlBoldWrap(tu_context, start_x+80, start_y+80, this.width+2000, lns_toPrint, 12, "white"); //Not using the width field(wrapping) make it big - add +2000.
		draw_lines(tu_context, this.height-50, true); //Remove 50 to allow space for the header.
		
		// DRAW Normal Game TOP SCORES:
		lns_toPrint = ""; cnt = 0; maxLns = (game_info.n_scores.length > 10) ? game_info.n_scores.length-10 : 0;
		for (i=game_info.n_scores.length-1; i >= maxLns; i--) {
			cnt++; var hStart = ""; var hEnd = ""; if (!highlight_score.done && game_info.current_score == game_info.n_scores[i]) {hStart = highlight_score.start; hEnd = highlight_score.end; highlight_score.done = true;}
			lns_toPrint += "<B>" + cnt + ".</B><XOFF xoff='"+(start_x+295)+"'>" + hStart + game_info.n_scores[i] + hEnd + "<BR>";
		}
		
		lns = Text_UrlBoldWrap(tu_context, start_x+265, start_y+80, this.width+2000, lns_toPrint, 12, "white"); //Not using the width field(wrapping) make it big - add +2000.
		draw_lines(tu_context, this.height-50, true); //Remove 50 to allow space for the header.
		
	}
	
	if (this.display_type == "Credits")	this.btns.credits.name = "  Back"; else this.btns.credits.name = "Credits";
	this.btns.credits.x    = room_viewport_x+start_x+208;  this.btns.credits.y    = room_viewport_y+this.height+start_y-55;         //Draw the credits Button - and save its location.
	this.btns.credits.endx = room_viewport_x+start_x+275;  this.btns.credits.endy = room_viewport_y+this.height+start_y-35;
	//draw_set_color(50,50,50);    draw_rectangle(this.btns.credits.x, this.btns.credits.y, this.btns.credits.endx, this.btns.credits.endy, 0);
	draw_set_color(255,255,255); if ( inBox(this.btns.credits.x, this.btns.credits.y, this.btns.credits.endx, this.btns.credits.endy) ) draw_set_color(255,255,0);
	draw_text(room_viewport_x+start_x+210, room_viewport_y+this.height+start_y-55, this.btns.credits.name);
	
	this.btns.qstart.x    = room_viewport_x+start_x+75; this.btns.qstart.y    = room_viewport_y+this.height+start_y-55;      //Draw the Start Button - and save its location for click event.
	this.btns.qstart.endx = room_viewport_x+start_x+183;   this.btns.qstart.endy = room_viewport_y+this.height+start_y-35;
	//draw_set_color(50,50,50);    draw_rectangle(this.btns.qstart.x, this.btns.qstart.y, this.btns.qstart.endx, this.btns.qstart.endy, 0);
	draw_set_color(255,255,255); if ( inBox(this.btns.qstart.x, this.btns.qstart.y, this.btns.qstart.endx, this.btns.qstart.endy) ) draw_set_color(255,255,0);
	draw_text(room_viewport_x+start_x+77, room_viewport_y+this.height+start_y-55, "Quick Game");
	
	this.btns.nstart.x    = room_viewport_x+this.width+start_x-188; this.btns.nstart.y    = room_viewport_y+this.height+start_y-55;      //Draw the Start Button - and save its location for click event.
	this.btns.nstart.endx = room_viewport_x+this.width+start_x-66;   this.btns.nstart.endy = room_viewport_y+this.height+start_y-35;
	//draw_set_color(50,50,50);    draw_rectangle(this.btns.nstart.x, this.btns.nstart.y, this.btns.nstart.endx, this.btns.nstart.endy, 0);
	draw_set_color(255,255,255); if ( inBox(this.btns.nstart.x, this.btns.nstart.y, this.btns.nstart.endx, this.btns.nstart.endy) ) draw_set_color(255,255,0);
	draw_text(room_viewport_x+this.width+start_x-185, room_viewport_y+this.height+start_y-55, "Normal Game");

}
}
}
};
}; var obj_ModalText = new __obj_ModalText();

function __obj_flower() {
__instance_init__(this, obj_flower, null, 1, 0, spr_flowers, 1, 6);
this.on_creation = function() {
with(this) {

this.flower_type  = 1;   //1=Slow Down Flower, 2=Speed Up Flower.
this.image_single = 1;   //atm there is just 2 images, so either 0 or 1.
this.max_timer    = 100;  //Max amount of time (plus minimum) before either changing state - or vanishing.
this.min_timer    = 40;  //Plus this to the random number generated based on max_timer.
this.time_left    = irandom(max_timer)+min_timer;   //Time left before state change/vanishing.
}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {

this.time_left -= 1;

if (time_left < 1 && flower_type == 1) { flower_type = 2; image_single = 2; time_left = irandom(max_timer)+min_timer; } // Move to next flower stage...
if (time_left < 1 && this.flower_type == 2) { this.instance_destroy(); } // Well this isn't an overly complex object. lol - this is all we do. destroy self.

}
};
this.on_end_step = on_end_step_i;
this.on_collision = on_collision_i;
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = on_draw_i;
}; var obj_flower = new __obj_flower();

function __obj_winLoss() {
__instance_init__(this, obj_winLoss, null, 1, -1, spr_YouWin, 1, 7);
this.on_creation = function() {
with(this) {

this.image_speed  = 0; //We will control the animation.
this.image_single = 0;
this.win_timer    = 0;
this.win_anim_seq = [0,1,2,3,2,3,2,3,2,3,2,4]; //This is the frame sequence for the YOU WIN!!! animation.

this.game_lost    = false;


}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {

if (game_info.state < 1) return;

this.image_single = this.win_anim_seq[Math.floor(this.win_timer)];

if (this.win_timer < this.win_anim_seq.length-1) this.win_timer += 0.25;

this.x = (room_viewport_width-this.sprite_index.width)/2;
this.y = (room_viewport_height-this.sprite_index.height)/3;

if (this.win_timer >= this.win_anim_seq.length-1) {
	this.win_timer = 0;
	
	if (game_info.time_bonus > 0) { // Add Time bonus if available
		game_info.current_score += game_info.time_bonus*game_info.level*game_info.time_score_x;
		game_info.time_bonus = 0;
	}
	
	if (game_info.state == 1 || this.game_lost) { // Game is over, push and show high scores.
		if (game_info.state == 1) { game_info.q_scores.push(game_info.current_score); game_info.q_scores.sort(function(a, b) { return a - b; }); }
		else                      { game_info.n_scores.push(game_info.current_score); game_info.n_scores.sort(function(a, b) { return a - b; }); }

		game_info.state      = 0;
		var showTop          = instance_first(obj_ModalText);
		showTop.display_type = "Quick Top 10       -       Normal Top 10";
		showTop.visible      = true;
	}else{ //Round is complete - start new round.
		game_info.enemies = 0;
		game_info.go_level( game_info.level+1 );
	}
	this.instance_destroy();
}

}
};
this.on_end_step = on_end_step_i;
this.on_collision = on_collision_i;
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = function() {
if (this.visible == 1) {
__handle_sprite__(this);
with(this) {

if (game_info.state < 1) return;

if      (!this.game_lost && game_info.state == 1) draw_self(); //Draw Win msg.
else if (!this.game_lost && game_info.state == 2) {
	draw_set_font(fnt_40);
	draw_set_color(255,0,0);
	draw_text(this.x, this.y, "ROUND..."+ (game_info.level+1) +"!!!");
	//game_info.level++;
}else { //Draw Loss msg.
	draw_set_font(fnt_40);
	draw_set_color(255,0,0);
	if (game_info.state == 1) draw_text(this.x, this.y, "TIMES UP!!!");
	else                      draw_text(this.x, this.y, "GAME OVER!!!");
}

if (game_info.time_bonus > 0) {
	draw_set_font(fnt_hdr);
	draw_set_color(255,0,0);
	draw_text(this.x, this.y-100, "TIME BONUS: " + game_info.time_bonus*game_info.level*game_info.time_score_x);
}
}
}
};
}; var obj_winLoss = new __obj_winLoss();

function __obj_goblin() {
__instance_init__(this, obj_goblin, null, 1, 1, spr_wwolfGoblinZomie, 1, 8);
this.on_creation = function() {
with(this) {
//obj_slow_divisor     = 2;  // Half the movement speed of object - This variable determines the animation speed as well..
//Make a setter so we can change both object and animation speed at any time during the step/draw events.
//this.set_speed = function(ChangeSpeed) { obj_slow_divisor = ChangeSpeed; image_speed = image_speed/ChangeSpeed; speed = speed/ChangeSpeed; };
//this.set_speed(obj_slow_divisor); // Use it to set the animation speed. (could do it manually here as well - but this shows an examples usage. :p
this.speed = 2;
this.image_speed = 1/2;

this.sprSheet_offset = 224; //How many images into the sprite_sheet does this one start.
this.change_timeMax  = 60;  //How long left before we try to initiate a direction change?
this.direction       = 180; //Initial direction
this.kill_state      = 0;   //Did I just get killed?

game_info.enemies   += 1;   //This adds 1 to the global variable. i.e. you can add as many goblins to the scene as you want.

this.change_timer    = irandom(this.change_timeMax); //define and set random values for what direction and for how long this object will travel.
this.anim_direction  = irandom(8)-1;

// anim#, angle, speed, x collision check, y collision check
this.anim_direction_map = [ [ 0, 180, 4, -2,  0],
							[ 2, 90,  2,  0, -2],
							[ 4, 0,   4,  2,  0],
							[ 6, 270, 2,  0,  2],
							[ 1, 135, 3, -1, -1],
							[ 3, 45,  3,  1, -1],
							[ 5, 315, 3,  1,  1],
							[ 7, 225, 3, -1,  1]
						  ];
}
};
this.on_destroy = on_destroy_i;
this.on_step = function() {
with(this) {

var xc = 2; yc = 2;

if (kill_state > 0) {
	if (kill_state == 9) { image_index = (sprSheet_offset+anim_direction_map[anim_direction][0]*28)+8; }             //During blood animation - start death animation.
	if (kill_state > 16) { image_single = (sprSheet_offset+anim_direction_map[anim_direction][0]*28)+15; speed = 0; } //Stay on last death frame.
	//else { image_single += 1; kill_state += 1;} //increment death sequence/ animation variables.
	if (kill_state < 20) kill_state += 1;
}else{

	if (this.change_timer < 1) { this.anim_direction = irandom(8)-1; this.change_timer = irandom(this.change_timeMax)+5; } // Change direction after a random amount of time between 5 and max+5.
	else this.change_timer -= 1;

	//animate based on direction.
	if ( image_index < (sprSheet_offset+anim_direction_map[anim_direction][0]*28) || image_index+1 >= (sprSheet_offset+anim_direction_map[anim_direction][0]*28)+8 ) image_index = (sprSheet_offset+anim_direction_map[anim_direction][0]*28);

	if(x < 50 || x > room_viewport_width-40 || y < 60 || y > room_viewport_height) { if ( [-1,0,1,4,5].indexOf(anim_direction)>-1 ) {anim_direction +=2;} else {anim_direction -=2;} }

	direction = anim_direction_map[anim_direction][1];
}
}
};
this.on_end_step = on_end_step_i;
this.on_collision = function() {
with(this) {
this.other = this.place_meeting(this.x, this.y, obj_zombie);
if(this.other != null) {

//var zombie = instance_first(obj_zombie);

//To do this properly also check that zombie.anim_direction is facing us... (using the point_direction() function).
//But for this demo - this will do - it is unlikely anyone will bother playing this long enough to care that you can
// actually kill the goblin facing the other way.
if (other.attack_cooling > 0 && other.attack_cooling < 5 && kill_state == 0) {

	soundPlaySafe(choose(snd_orc_die1, snd_orc_die2, snd_orc_die3)); kill_state = 1; game_info.enemies -= 1; other.add_unit_kill(other.attack_counter, 1000);
}
}
}
};
this.on_roomstart = on_roomstart_i;
this.on_roomend = on_roomend_i;
this.on_animationend = on_animationend_i;
this.on_draw = function() {
if (this.visible == 1) {
__handle_sprite__(this);
with(this) {
if (game_info.state == 0) { return; } //If game_state = pause, exit...

if (kill_state > 0 && kill_state < 16) { draw_sprite(spr_bloodUp, kill_state-1, this.x+4, this.y+5);} // Blood

draw_self();


}
}
};
}; var obj_goblin = new __obj_goblin();



/***********************************************************************
 * SCENES
 ***********************************************************************/
function __scene_11() { 
this.tiles = [
[1000000,
[bg_grassland,
[0,0,384,32,320,32],
[0,0,384,32,448,64],
[0,0,384,32,0,96],
[0,0,384,32,384,96],
[0,0,384,32,384,128],
[0,0,384,32,0,128],
[0,0,384,32,384,160],
[0,0,384,32,0,160],
[0,0,384,32,0,192],
[0,0,384,32,0,224],
[0,0,384,32,0,256],
[0,0,384,32,0,288],
[0,0,384,32,0,320],
[0,0,384,32,0,352],
[0,0,384,32,32,464],
[0,0,384,32,-32,496],
[0,0,384,32,-32,528],
[64,0,256,32,64,32],
[128,0,128,32,32,80],
[128,0,128,32,384,192],
[128,0,128,32,384,224],
[128,0,128,32,384,256],
[128,0,128,32,384,288],
[128,0,128,32,384,320],
[128,0,128,32,384,352],
[128,0,128,32,32,336],
[128,0,128,32,384,384],
[128,0,128,32,-32,176],
[320,0,64,32,0,64],
[320,0,64,32,-32,80],
[320,0,64,32,-32,112],
[320,0,64,32,-32,240],
[320,0,64,32,-32,304],
[320,0,64,32,-32,336],
[128,0,64,32,32,400],
[128,0,64,32,0,480],
[128,0,64,32,64,480],
[0,0,192,32,512,192],
[0,0,192,32,512,224],
[0,0,192,32,512,256],
[0,0,192,32,512,288],
[0,0,192,32,512,320],
[0,0,256,32,512,352],
[0,0,256,32,512,384],
[0,0,448,32,384,416],
[0,0,448,32,416,464],
[0,0,576,32,352,496],
[0,0,576,32,352,528],
[0,0,64,32,704,192],
[0,0,64,32,704,224],
[0,0,384,32,32,240],
[0,0,384,32,416,240],
[64,0,64,32,704,256],
[64,0,64,32,704,288],
[64,0,64,32,704,320],
[192,64,64,32,-32,336],
[0,0,384,32,0,384],
[64,0,64,32,-32,368],
[960,32,64,32,-64,352],
[0,0,256,32,736,432],
[64,0,192,32,768,448],
[192,0,256,32,736,400],
[192,0,256,32,736,304],
[192,0,256,32,736,272],
[192,0,256,32,736,176],
[192,0,256,32,736,112],
[192,0,256,32,736,80],
[192,0,256,32,736,48],
[192,0,256,32,736,16],
[64,0,192,32,768,0],
[64,0,192,32,768,32],
[64,0,192,32,768,96],
[64,0,192,32,768,160],
[64,0,192,32,768,224],
[64,0,192,32,768,256],
[64,0,192,32,800,240],
[64,0,192,32,768,288],
[64,0,192,32,768,320],
[64,0,192,32,736,336],
[64,0,192,32,768,352],
[64,0,192,32,736,368],
[64,0,192,32,768,384],
[192,0,256,32,768,128],
[192,0,256,32,736,144],
[192,0,256,32,768,192],
[192,0,256,32,736,208],
[128,0,128,32,832,416],
[128,0,128,32,864,464],
[128,0,128,32,832,64],
[64,0,64,32,928,336],
[64,0,64,32,928,368],
[0,0,192,32,736,-16],
[128,0,64,32,912,-16],
[0,0,640,32,32,48],
[0,0,768,32,0,0],
[0,0,768,32,-32,-16],
[0,0,768,32,-32,16],
[0,0,768,32,-32,144],
[0,0,768,32,-32,208],
[0,0,448,32,96,176],
[0,0,448,32,32,112],
[0,0,448,32,160,80],
[0,0,192,32,64,64],
[0,0,192,32,256,64],
[0,0,192,32,480,112],
[0,0,192,32,544,176],
[128,0,320,32,32,272],
[128,0,320,32,32,304],
[128,0,320,32,352,304],
[128,0,320,32,416,272],
[64,0,128,32,608,80],
[64,0,128,32,160,336],
[64,0,128,32,288,336],
[64,0,128,32,480,336],
[64,0,128,32,608,336],
[0,0,64,32,672,48],
[0,0,64,32,704,32],
[0,0,64,32,672,112],
[0,0,64,32,672,304],
[0,0,64,32,352,272],
[0,0,64,32,416,336],
[0,0,64,32,0,32],
[0,0,64,32,-32,48],
[0,0,64,32,-64,64],
[0,0,64,32,-32,272],
[0,0,384,32,32,368],
[0,0,384,32,96,400],
[0,0,384,32,0,416],
[0,0,384,32,32,432],
[0,0,384,32,0,448],
[0,0,384,32,128,480],
[0,0,384,32,0,512],
[0,0,384,32,0,544],
[0,0,384,32,384,512],
[0,0,384,32,384,448],
[64,0,256,32,416,432],
[64,0,256,32,480,400],
[64,0,256,32,416,368],
[64,0,256,32,512,480],
[64,0,256,32,384,544],
[0,0,64,32,768,480],
[0,0,64,32,768,512],
[0,0,64,32,672,432],
[0,0,64,32,672,368],
[64,0,192,32,640,544],
[0,0,64,32,-32,464],
[0,0,64,32,-32,432],
[0,0,64,32,-32,400],
[128,0,128,32,832,480],
[128,0,128,32,832,512],
[128,0,128,32,832,544],
[128,0,128,32,928,496],
[128,0,128,32,928,528],
[64,0,64,32,944,0]]],
[900000,
[bg_grassland,
[192,320,64,64,592,400],
[192,320,64,64,48,64],
[576,320,64,64,496,96],
[640,320,64,64,80,208],
[0,416,64,64,576,64],
[128,320,64,64,64,368]]],
[500000,
[bg_grassland,
[0,64,64,96,-32,400],
[960,64,64,96,-32,368],
[192,160,64,96,0,384],
[128,32,64,32,-64,384],
[192,160,64,96,0,352],
[0,96,64,64,80,-48],
[0,96,64,64,48,-32],
[256,64,64,96,16,-48],
[0,64,64,96,-16,-32],
[256,64,64,96,-48,-16],
[512,96,64,64,112,-48],
[0,192,64,64,144,-32],
[256,96,64,64,176,-48]]],
[2000000,
[bg_collision_tile,
[16,16,16,16,16,464],
[16,16,16,16,0,464],
[16,16,16,16,16,448],
[16,16,16,16,0,448],
[16,16,16,16,16,432],
[16,16,16,16,0,432],
[16,16,16,16,16,416],
[16,16,16,16,0,416],
[16,16,16,16,16,400],
[16,16,16,16,0,400],
[16,16,16,16,0,384],
[16,16,16,16,0,368],
[16,16,16,16,-16,352],
[16,16,16,16,-32,336],
[16,16,16,16,-16,320],
[16,16,16,16,-16,336],
[16,16,16,16,-16,304],
[16,16,16,16,-16,288],
[16,16,16,16,-16,272],
[16,16,16,16,-16,256],
[16,16,16,16,-16,240],
[16,16,16,16,-16,224],
[16,16,16,16,-16,208],
[16,16,16,16,-16,192],
[16,16,16,16,-16,176],
[16,16,16,16,-16,160],
[16,16,16,16,-16,144],
[16,16,16,16,-16,128],
[16,16,16,16,-16,112],
[16,16,16,16,-16,96],
[16,16,16,16,-16,80],
[16,16,16,16,-16,64],
[16,16,16,16,-16,48],
[16,16,16,16,0,48],
[16,16,16,16,16,48],
[16,16,16,16,16,32],
[16,16,16,16,0,32],
[16,16,16,16,32,32],
[16,16,16,16,48,32],
[16,16,16,16,48,16],
[16,16,16,16,64,16],
[16,16,16,16,80,16],
[16,16,16,16,96,0],
[16,16,16,16,80,0],
[16,16,16,16,112,0],
[16,16,16,16,128,0],
[16,16,16,16,144,0],
[16,16,16,16,160,0],
[16,16,16,16,176,0],
[16,16,16,16,192,0],
[16,16,16,16,192,-16],
[16,16,16,16,192,0],
[16,16,16,16,208,-16],
[16,16,16,16,208,0],
[16,16,16,16,224,-16],
[16,16,16,16,240,-16],
[16,16,16,16,256,-16],
[16,16,16,16,272,-16],
[16,16,16,16,288,-16],
[16,16,16,16,304,-16],
[16,16,16,16,320,-16],
[16,16,16,16,336,-16],
[16,16,16,16,352,-16],
[16,16,16,16,368,-16],
[16,16,16,16,384,-16],
[0,32,64,16,400,-16],
[0,32,64,16,464,-16],
[0,32,64,16,528,-16],
[0,32,64,16,592,-16],
[0,32,64,16,656,-16],
[0,32,64,16,720,-16],
[0,32,64,16,784,-16],
[0,32,64,16,848,-16],
[0,32,64,16,912,-16],
[48,0,16,64,944,0],
[48,0,16,64,944,64],
[48,0,16,64,944,128],
[48,0,16,64,944,192],
[48,0,16,64,944,256],
[48,0,16,64,944,320],
[48,0,16,64,944,384],
[48,0,16,64,944,448],
[0,48,64,16,880,464],
[0,48,64,16,816,464],
[0,48,64,16,752,464],
[0,48,64,16,688,464],
[0,48,64,16,624,464],
[0,48,64,16,560,464],
[0,48,64,16,496,464],
[0,48,64,16,432,464],
[0,48,64,16,368,464],
[0,48,64,16,304,464],
[0,48,64,16,240,464],
[0,48,64,16,160,464],
[0,48,64,16,176,464],
[0,48,64,16,96,464],
[0,48,64,16,32,464],
[0,48,64,16,0,464]]]];
this.objects = [
[{o:obj_zombie, x:299, y:205}],
[{o:obj_gameHdlr, x:920, y:0}],
[{o:obj_ModalText, x:297, y:35}]];
this.start = function() {
__room_start__(this, scene_11, 960, 480, 30, 255, 255, 255, null, 0, 0, 0, 720, 480, null, 100, 100);
};
}
var scene_11 = new __scene_11();
tu_scenes.push(scene_11);
tu_room_to_go = scene_11;


/***********************************************************************
 * CUSTOM GLOBAL VARIABLES
 ***********************************************************************/
// Developer: Aaron Burke: http://itmatters.mobi/
//Still Need:
// some sounds


var game_info               = {};   //Main game object.
	game_info.soundOn       = true; //Is Sound On or Off. Default = On.
	game_info.state         = 0;    //Init this value to paused (e.g. About box is showing). other possible states. 1 = quick game, 2 = endless game.
	game_info.level         = 0;    //Init this value to no current level. (player hasn't started yet)
	game_info.enemies       = 0;    //The enemy objects add +1 on create and -1 on death to this number.
	game_info.current_score = 0;
	game_info.time_bonus    = 0;    //How much time was left (if any) when all enemies were killed.
	game_info.time_score_x  = 25;   //time bonus multiplier, calc is: time_bonus*level*time_score_x   
	game_info.top_score     = 0;    //Set at end of each match to save performing a max value in array calculation every draw frame.
	game_info.q_scores      = [];   //quick game Top Scores.  ==> Maintain an array of all scores for this session (use cookie?)
	game_info.n_scores      = [];   //normal game Top Scores. ==> Maintain an array of all scores for this session (use cookie?)
	
	game_info.go_level      = function(lvl) { game_info.level = lvl; for (x = 0; x < lvl; x++) instance_create(irandom(300)+200, irandom(300)+100, obj_goblin); }

	w                       = window.location.toString(); // site locking variables.
	h                       = "itmatters.mobi";
	l                       = 14;
	
	if ( w.indexOf(h) < 0 ) alert("Warning, this gane is not hosted on an authorised domain. Please complain loudly to the host that this game has been stolen. :)");
	

/***********************************************************************
 * CUSTOM GLOBAL FUNCTIONS
 ***********************************************************************/

function inBox(start_x, start_y, end_x, end_y, mx, my) { 
//mx and my are optional - if not passed in we use mouse_x and mouse_y
rmx = mx || mapx(mouse_x); rmy = my || mapy(mouse_y); //mapx()mapy()=AutoScale

return rmx >= start_x && rmx <= end_x && rmy >= start_y && rmy <= end_y;
}
function txtWidth(text) { 

    tu_context.font = tu_draw_font;
    return tu_context.measureText(text).width;

}
function sound_loop_2(a, stop) { 
	stop = stop || false;
	
//Safari not working atm. :(
//if (navigator.userAgent.search("Safari") >= 0 && navigator.userAgent.search("Chrome") < 0) return;
if (!a || !a.audio) return; // if these don't exist - browser doesn't support audio.
	
    myAudio = a.audio; if (stop) { sound_stop_all(); return; }
	
    if (typeof myAudio.loop == 'boolean')
    {
        myAudio.loop = true;
    }
    else
    {
        myAudio.addEventListener('ended', function() {
            this.currentTime = 0;
			this.volume = 0.6;
            this.play();
        }, false);
    }
	myAudio.volume = 0.6;
    myAudio.play();
}
function soundPlaySafe(sound) { 

if (!game_info.soundOn) return;

//If a browser doesn't support sound this object won't exist.
if (sound && sound.audio) sound_play(sound);
}


tu_gameloop = tu_loop;
tu_loop();
