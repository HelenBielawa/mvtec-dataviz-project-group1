
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function (internal, svelte, d3Array, aq, d3Shape, d3Scale, d3ScaleChromatic) {
    'use strict';

    function _interopNamespace(e) {
        if (e && e.__esModule) return e;
        var n = Object.create(null);
        if (e) {
            Object.keys(e).forEach(function (k) {
                if (k !== 'default') {
                    var d = Object.getOwnPropertyDescriptor(e, k);
                    Object.defineProperty(n, k, d.get ? d : {
                        enumerable: true,
                        get: function () {
                            return e[k];
                        }
                    });
                }
            });
        }
        n['default'] = e;
        return Object.freeze(n);
    }

    var aq__namespace = /*#__PURE__*/_interopNamespace(aq);

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
            'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.55.0' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\components\common\Axis.svelte generated by Svelte v3.31.0 */

    const file = "src\\components\\common\\Axis.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (64:34) 
    function create_if_block_4(ctx) {
    	let g;
    	let g_transform_value;

    	function select_block_type_2(ctx, dirty) {
    		if (/*tick*/ ctx[11].value === "0") return create_if_block_5;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type_2(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			if_block.c();
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "transform", g_transform_value = "translate(0, " + /*tick*/ ctx[11].offset + ")");
    			add_location(g, file, 64, 4, 1739);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			if_block.m(g, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(g, null);
    				}
    			}

    			if (dirty & /*ticks*/ 8 && g_transform_value !== (g_transform_value = "translate(0, " + /*tick*/ ctx[11].offset + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(64:34) ",
    		ctx
    	});

    	return block;
    }

    // (53:35) 
    function create_if_block_2(ctx) {
    	let g;
    	let g_transform_value;

    	function select_block_type_1(ctx, dirty) {
    		if (/*tick*/ ctx[11].value === "0") return create_if_block_3;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			if_block.c();
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "transform", g_transform_value = "translate(0, " + /*tick*/ ctx[11].offset + ")");
    			add_location(g, file, 53, 4, 1406);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			if_block.m(g, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(g, null);
    				}
    			}

    			if (dirty & /*ticks*/ 8 && g_transform_value !== (g_transform_value = "translate(0, " + /*tick*/ ctx[11].offset + ")")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(53:35) ",
    		ctx
    	});

    	return block;
    }

    // (46:31) 
    function create_if_block_1(ctx) {
    	let g;
    	let line;
    	let text_1;
    	let t_value = /*tick*/ ctx[11].value + "";
    	let t;
    	let text_1_text_anchor_value;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "y2", "-6");
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 47, 6, 1234);
    			attr_dev(text_1, "class", "label");
    			attr_dev(text_1, "y", "-10");
    			attr_dev(text_1, "text-anchor", text_1_text_anchor_value = /*anchor*/ ctx[4](/*tick*/ ctx[11].offset));
    			add_location(text_1, file, 48, 6, 1256);
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*tick*/ ctx[11].offset + ", 0)");
    			add_location(g, file, 46, 4, 1170);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*ticks*/ 8 && t_value !== (t_value = /*tick*/ ctx[11].value + "")) set_data_dev(t, t_value);

    			if (dirty & /*anchor, ticks*/ 24 && text_1_text_anchor_value !== (text_1_text_anchor_value = /*anchor*/ ctx[4](/*tick*/ ctx[11].offset))) {
    				attr_dev(text_1, "text-anchor", text_1_text_anchor_value);
    			}

    			if (dirty & /*ticks*/ 8 && g_transform_value !== (g_transform_value = "translate(" + /*tick*/ ctx[11].offset + ", 0)")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(46:31) ",
    		ctx
    	});

    	return block;
    }

    // (39:4) {#if position === 'bottom'}
    function create_if_block(ctx) {
    	let g;
    	let line;
    	let text_1;
    	let t_value = /*tick*/ ctx[11].value + "";
    	let t;
    	let text_1_text_anchor_value;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "y2", "6");
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 40, 6, 1004);
    			attr_dev(text_1, "class", "label");
    			attr_dev(text_1, "y", "20");
    			attr_dev(text_1, "text-anchor", text_1_text_anchor_value = /*anchor*/ ctx[4](/*tick*/ ctx[11].offset));
    			add_location(text_1, file, 41, 6, 1025);
    			attr_dev(g, "class", "tick");
    			attr_dev(g, "transform", g_transform_value = "translate(" + /*tick*/ ctx[11].offset + ", 0)");
    			add_location(g, file, 39, 4, 940);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*ticks*/ 8 && t_value !== (t_value = /*tick*/ ctx[11].value + "")) set_data_dev(t, t_value);

    			if (dirty & /*anchor, ticks*/ 24 && text_1_text_anchor_value !== (text_1_text_anchor_value = /*anchor*/ ctx[4](/*tick*/ ctx[11].offset))) {
    				attr_dev(text_1, "text-anchor", text_1_text_anchor_value);
    			}

    			if (dirty & /*ticks*/ 8 && g_transform_value !== (g_transform_value = "translate(" + /*tick*/ ctx[11].offset + ", 0)")) {
    				attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(39:4) {#if position === 'bottom'}",
    		ctx
    	});

    	return block;
    }

    // (68:3) {:else}
    function create_else_block_1(ctx) {
    	let line;
    	let text_1;
    	let t_value = /*tick*/ ctx[11].value + "";
    	let t;

    	const block = {
    		c: function create() {
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "x2", /*width*/ ctx[0]);
    			attr_dev(line, "stroke-dasharray", "2 3");
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 68, 6, 1873);
    			attr_dev(text_1, "class", "label");
    			attr_dev(text_1, "x", "0");
    			attr_dev(text_1, "y", "-5");
    			attr_dev(text_1, "text-anchor", "start");
    			add_location(text_1, file, 69, 6, 1923);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line, anchor);
    			insert_dev(target, text_1, anchor);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*width*/ 1) {
    				attr_dev(line, "x2", /*width*/ ctx[0]);
    			}

    			if (dirty & /*ticks*/ 8 && t_value !== (t_value = /*tick*/ ctx[11].value + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line);
    			if (detaching) detach_dev(text_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(68:3) {:else}",
    		ctx
    	});

    	return block;
    }

    // (66:6) {#if tick.value === '0'}
    function create_if_block_5(ctx) {
    	let line;

    	const block = {
    		c: function create() {
    			line = svg_element("line");
    			attr_dev(line, "x2", /*width*/ ctx[0]);
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 66, 6, 1835);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*width*/ 1) {
    				attr_dev(line, "x2", /*width*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(66:6) {#if tick.value === '0'}",
    		ctx
    	});

    	return block;
    }

    // (57:3) {:else}
    function create_else_block(ctx) {
    	let line;
    	let text_1;
    	let t_value = /*tick*/ ctx[11].value + "";
    	let t;

    	const block = {
    		c: function create() {
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			attr_dev(line, "x2", /*width*/ ctx[0]);
    			attr_dev(line, "stroke-dasharray", "2 3");
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 57, 6, 1537);
    			attr_dev(text_1, "class", "label");
    			attr_dev(text_1, "x", /*width*/ ctx[0]);
    			attr_dev(text_1, "y", "-5");
    			attr_dev(text_1, "text-anchor", "end");
    			add_location(text_1, file, 58, 6, 1587);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line, anchor);
    			insert_dev(target, text_1, anchor);
    			append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*width*/ 1) {
    				attr_dev(line, "x2", /*width*/ ctx[0]);
    			}

    			if (dirty & /*ticks*/ 8 && t_value !== (t_value = /*tick*/ ctx[11].value + "")) set_data_dev(t, t_value);

    			if (dirty & /*width*/ 1) {
    				attr_dev(text_1, "x", /*width*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line);
    			if (detaching) detach_dev(text_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(57:3) {:else}",
    		ctx
    	});

    	return block;
    }

    // (55:3) {#if tick.value === '0'}
    function create_if_block_3(ctx) {
    	let line;

    	const block = {
    		c: function create() {
    			line = svg_element("line");
    			attr_dev(line, "x2", /*width*/ ctx[0]);
    			attr_dev(line, "class", "svelte-14915d6");
    			add_location(line, file, 55, 6, 1499);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, line, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*width*/ 1) {
    				attr_dev(line, "x2", /*width*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(55:3) {#if tick.value === '0'}",
    		ctx
    	});

    	return block;
    }

    // (38:2) {#each ticks as tick}
    function create_each_block(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*position*/ ctx[1] === "bottom") return create_if_block;
    		if (/*position*/ ctx[1] === "top") return create_if_block_1;
    		if (/*position*/ ctx[1] === "right") return create_if_block_2;
    		if (/*position*/ ctx[1] === "left") return create_if_block_4;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(38:2) {#each ticks as tick}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let g;
    	let each_value = /*ticks*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			g = svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(g, "class", "axis");
    			attr_dev(g, "transform", /*transform*/ ctx[2]);
    			attr_dev(g, "pointer-events", "none");
    			add_location(g, file, 36, 0, 826);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*ticks, anchor, position, width*/ 27) {
    				each_value = /*ticks*/ ctx[3];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*transform*/ 4) {
    				attr_dev(g, "transform", /*transform*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Axis", slots, []);
    	let { width } = $$props;
    	let { height } = $$props;
    	let { margin } = $$props;
    	let { scale } = $$props;
    	let { position } = $$props;
    	let { format } = $$props;
    	let { time } = $$props;
    	const writable_props = ["width", "height", "margin", "scale", "position", "format", "time"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Axis> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("width" in $$props) $$invalidate(0, width = $$props.width);
    		if ("height" in $$props) $$invalidate(5, height = $$props.height);
    		if ("margin" in $$props) $$invalidate(6, margin = $$props.margin);
    		if ("scale" in $$props) $$invalidate(7, scale = $$props.scale);
    		if ("position" in $$props) $$invalidate(1, position = $$props.position);
    		if ("format" in $$props) $$invalidate(8, format = $$props.format);
    		if ("time" in $$props) $$invalidate(9, time = $$props.time);
    	};

    	$$self.$capture_state = () => ({
    		width,
    		height,
    		margin,
    		scale,
    		position,
    		format,
    		time,
    		nTicks,
    		transform,
    		ticks,
    		anchor
    	});

    	$$self.$inject_state = $$props => {
    		if ("width" in $$props) $$invalidate(0, width = $$props.width);
    		if ("height" in $$props) $$invalidate(5, height = $$props.height);
    		if ("margin" in $$props) $$invalidate(6, margin = $$props.margin);
    		if ("scale" in $$props) $$invalidate(7, scale = $$props.scale);
    		if ("position" in $$props) $$invalidate(1, position = $$props.position);
    		if ("format" in $$props) $$invalidate(8, format = $$props.format);
    		if ("time" in $$props) $$invalidate(9, time = $$props.time);
    		if ("nTicks" in $$props) $$invalidate(10, nTicks = $$props.nTicks);
    		if ("transform" in $$props) $$invalidate(2, transform = $$props.transform);
    		if ("ticks" in $$props) $$invalidate(3, ticks = $$props.ticks);
    		if ("anchor" in $$props) $$invalidate(4, anchor = $$props.anchor);
    	};

    	let nTicks;
    	let transform;
    	let ticks;
    	let anchor;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*position, width, height*/ 35) {
    			 $$invalidate(10, nTicks = position === "bottom" || position === "top"
    			? width / 50
    			: height / 50);
    		}

    		if ($$self.$$.dirty & /*position, height, margin*/ 98) {
    			 $$invalidate(2, transform = position === "bottom"
    			? `translate(0, ${height - margin.bottom - margin.top})`
    			: position === "top"
    				? `translate(0, ${margin.top})`
    				: position === "left"
    					? `translate(${margin.left}, 0)`
    					: `translate(0, ${margin.right})`);
    		}

    		if ($$self.$$.dirty & /*scale, time, nTicks, format*/ 1920) {
    			 $$invalidate(3, ticks = scale.ticks(!time ? nTicks : time).map(d => ({ value: format(d), offset: scale(d) })));
    		}

    		if ($$self.$$.dirty & /*width*/ 1) {
    			 $$invalidate(4, anchor = x => {
    				switch (true) {
    					case x < 20:
    						return "start";
    					case x > width - 40:
    						return "end";
    					default:
    						return "middle";
    				}
    			});
    		}
    	};

    	return [
    		width,
    		position,
    		transform,
    		ticks,
    		anchor,
    		height,
    		margin,
    		scale,
    		format,
    		time,
    		nTicks
    	];
    }

    class Axis extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			width: 0,
    			height: 5,
    			margin: 6,
    			scale: 7,
    			position: 1,
    			format: 8,
    			time: 9
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Axis",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*width*/ ctx[0] === undefined && !("width" in props)) {
    			console.warn("<Axis> was created without expected prop 'width'");
    		}

    		if (/*height*/ ctx[5] === undefined && !("height" in props)) {
    			console.warn("<Axis> was created without expected prop 'height'");
    		}

    		if (/*margin*/ ctx[6] === undefined && !("margin" in props)) {
    			console.warn("<Axis> was created without expected prop 'margin'");
    		}

    		if (/*scale*/ ctx[7] === undefined && !("scale" in props)) {
    			console.warn("<Axis> was created without expected prop 'scale'");
    		}

    		if (/*position*/ ctx[1] === undefined && !("position" in props)) {
    			console.warn("<Axis> was created without expected prop 'position'");
    		}

    		if (/*format*/ ctx[8] === undefined && !("format" in props)) {
    			console.warn("<Axis> was created without expected prop 'format'");
    		}

    		if (/*time*/ ctx[9] === undefined && !("time" in props)) {
    			console.warn("<Axis> was created without expected prop 'time'");
    		}
    	}

    	get width() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get margin() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set margin(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scale() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scale(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get position() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set position(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get format() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get time() {
    		throw new Error("<Axis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set time(value) {
    		throw new Error("<Axis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\common\PointInteractive.svelte generated by Svelte v3.31.0 */

    const file$1 = "src\\components\\common\\PointInteractive.svelte";

    // (24:0) {#if datum !== undefined}
    function create_if_block$1(ctx) {
    	let g;
    	let line;
    	let line_x__value;
    	let line_y__value;
    	let line_x__value_1;
    	let line_y__value_1;
    	let circle;
    	let circle_cx_value;
    	let circle_cy_value;
    	let text0;
    	let t0_value = /*format*/ ctx[5].y(/*datum*/ ctx[0][/*key*/ ctx[1].y]) + "";
    	let t0;
    	let text0_x_value;
    	let text0_y_value;
    	let text0_text_anchor_value;
    	let text1;
    	let t1_value = /*format*/ ctx[5].x(/*datum*/ ctx[0][/*key*/ ctx[1].x]) + "";
    	let t1;
    	let text1_x_value;
    	let text1_y_value;
    	let text1_text_anchor_value;

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			line = svg_element("line");
    			circle = svg_element("circle");
    			text0 = svg_element("text");
    			t0 = text(t0_value);
    			text1 = svg_element("text");
    			t1 = text(t1_value);
    			attr_dev(line, "x1", line_x__value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]));
    			attr_dev(line, "y1", line_y__value = /*y*/ ctx[3](0));
    			attr_dev(line, "x2", line_x__value_1 = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]));
    			attr_dev(line, "y2", line_y__value_1 = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]));
    			attr_dev(line, "pointer-events", "none");
    			attr_dev(line, "stroke", "rgba(0,0,0,.5)");
    			attr_dev(line, "stroke-width", ".3");
    			attr_dev(line, "class", "tooltip");
    			add_location(line, file$1, 25, 4, 413);
    			attr_dev(circle, "r", /*r*/ ctx[6]);
    			attr_dev(circle, "cx", circle_cx_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]));
    			attr_dev(circle, "cy", circle_cy_value = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]));
    			attr_dev(circle, "stroke", "rgba(0,0,0,1)");
    			attr_dev(circle, "pointer-events", "none");
    			attr_dev(circle, "stroke-width", "2");
    			attr_dev(circle, "fill", /*color*/ ctx[4]);
    			attr_dev(circle, "class", "tooltip");
    			add_location(circle, file$1, 35, 4, 655);
    			attr_dev(text0, "x", text0_x_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]));
    			attr_dev(text0, "y", text0_y_value = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]) - 8);
    			attr_dev(text0, "pointer-events", "none");
    			attr_dev(text0, "text-anchor", text0_text_anchor_value = /*anchor*/ ctx[7](/*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x])));
    			attr_dev(text0, "class", "tooltip value svelte-1x25tuj");
    			add_location(text0, file$1, 45, 4, 885);
    			attr_dev(text1, "x", text1_x_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]));
    			attr_dev(text1, "y", text1_y_value = /*y*/ ctx[3](0) + 20);
    			attr_dev(text1, "pointer-events", "none");
    			attr_dev(text1, "text-anchor", text1_text_anchor_value = /*anchor*/ ctx[7](/*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x])));
    			attr_dev(text1, "class", "tooltip label svelte-1x25tuj");
    			add_location(text1, file$1, 54, 4, 1121);
    			add_location(g, file$1, 24, 0, 404);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, line);
    			append_dev(g, circle);
    			append_dev(g, text0);
    			append_dev(text0, t0);
    			append_dev(g, text1);
    			append_dev(text1, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*x, datum, key*/ 7 && line_x__value !== (line_x__value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]))) {
    				attr_dev(line, "x1", line_x__value);
    			}

    			if (dirty & /*y*/ 8 && line_y__value !== (line_y__value = /*y*/ ctx[3](0))) {
    				attr_dev(line, "y1", line_y__value);
    			}

    			if (dirty & /*x, datum, key*/ 7 && line_x__value_1 !== (line_x__value_1 = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]))) {
    				attr_dev(line, "x2", line_x__value_1);
    			}

    			if (dirty & /*y, datum, key*/ 11 && line_y__value_1 !== (line_y__value_1 = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]))) {
    				attr_dev(line, "y2", line_y__value_1);
    			}

    			if (dirty & /*r*/ 64) {
    				attr_dev(circle, "r", /*r*/ ctx[6]);
    			}

    			if (dirty & /*x, datum, key*/ 7 && circle_cx_value !== (circle_cx_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]))) {
    				attr_dev(circle, "cx", circle_cx_value);
    			}

    			if (dirty & /*y, datum, key*/ 11 && circle_cy_value !== (circle_cy_value = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]))) {
    				attr_dev(circle, "cy", circle_cy_value);
    			}

    			if (dirty & /*color*/ 16) {
    				attr_dev(circle, "fill", /*color*/ ctx[4]);
    			}

    			if (dirty & /*format, datum, key*/ 35 && t0_value !== (t0_value = /*format*/ ctx[5].y(/*datum*/ ctx[0][/*key*/ ctx[1].y]) + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*x, datum, key*/ 7 && text0_x_value !== (text0_x_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]))) {
    				attr_dev(text0, "x", text0_x_value);
    			}

    			if (dirty & /*y, datum, key*/ 11 && text0_y_value !== (text0_y_value = /*y*/ ctx[3](/*datum*/ ctx[0][/*key*/ ctx[1].y]) - 8)) {
    				attr_dev(text0, "y", text0_y_value);
    			}

    			if (dirty & /*anchor, x, datum, key*/ 135 && text0_text_anchor_value !== (text0_text_anchor_value = /*anchor*/ ctx[7](/*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x])))) {
    				attr_dev(text0, "text-anchor", text0_text_anchor_value);
    			}

    			if (dirty & /*format, datum, key*/ 35 && t1_value !== (t1_value = /*format*/ ctx[5].x(/*datum*/ ctx[0][/*key*/ ctx[1].x]) + "")) set_data_dev(t1, t1_value);

    			if (dirty & /*x, datum, key*/ 7 && text1_x_value !== (text1_x_value = /*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x]))) {
    				attr_dev(text1, "x", text1_x_value);
    			}

    			if (dirty & /*y*/ 8 && text1_y_value !== (text1_y_value = /*y*/ ctx[3](0) + 20)) {
    				attr_dev(text1, "y", text1_y_value);
    			}

    			if (dirty & /*anchor, x, datum, key*/ 135 && text1_text_anchor_value !== (text1_text_anchor_value = /*anchor*/ ctx[7](/*x*/ ctx[2](/*datum*/ ctx[0][/*key*/ ctx[1].x])))) {
    				attr_dev(text1, "text-anchor", text1_text_anchor_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(24:0) {#if datum !== undefined}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let if_block = /*datum*/ ctx[0] !== undefined && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*datum*/ ctx[0] !== undefined) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("PointInteractive", slots, []);
    	let { width } = $$props;
    	let { datum } = $$props;
    	let { key } = $$props;
    	let { x } = $$props;
    	let { y } = $$props;
    	let { color } = $$props;
    	let { format } = $$props;
    	let { r = 3 } = $$props;
    	const writable_props = ["width", "datum", "key", "x", "y", "color", "format", "r"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PointInteractive> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("width" in $$props) $$invalidate(8, width = $$props.width);
    		if ("datum" in $$props) $$invalidate(0, datum = $$props.datum);
    		if ("key" in $$props) $$invalidate(1, key = $$props.key);
    		if ("x" in $$props) $$invalidate(2, x = $$props.x);
    		if ("y" in $$props) $$invalidate(3, y = $$props.y);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("format" in $$props) $$invalidate(5, format = $$props.format);
    		if ("r" in $$props) $$invalidate(6, r = $$props.r);
    	};

    	$$self.$capture_state = () => ({
    		width,
    		datum,
    		key,
    		x,
    		y,
    		color,
    		format,
    		r,
    		anchor
    	});

    	$$self.$inject_state = $$props => {
    		if ("width" in $$props) $$invalidate(8, width = $$props.width);
    		if ("datum" in $$props) $$invalidate(0, datum = $$props.datum);
    		if ("key" in $$props) $$invalidate(1, key = $$props.key);
    		if ("x" in $$props) $$invalidate(2, x = $$props.x);
    		if ("y" in $$props) $$invalidate(3, y = $$props.y);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("format" in $$props) $$invalidate(5, format = $$props.format);
    		if ("r" in $$props) $$invalidate(6, r = $$props.r);
    		if ("anchor" in $$props) $$invalidate(7, anchor = $$props.anchor);
    	};

    	let anchor;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*width*/ 256) {
    			 $$invalidate(7, anchor = x => {
    				switch (true) {
    					case x < 20:
    						return "start";
    					case x > width - 40:
    						return "end";
    					default:
    						return "middle";
    				}
    			});
    		}
    	};

    	return [datum, key, x, y, color, format, r, anchor, width];
    }

    class PointInteractive extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			width: 8,
    			datum: 0,
    			key: 1,
    			x: 2,
    			y: 3,
    			color: 4,
    			format: 5,
    			r: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PointInteractive",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*width*/ ctx[8] === undefined && !("width" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'width'");
    		}

    		if (/*datum*/ ctx[0] === undefined && !("datum" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'datum'");
    		}

    		if (/*key*/ ctx[1] === undefined && !("key" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'key'");
    		}

    		if (/*x*/ ctx[2] === undefined && !("x" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'x'");
    		}

    		if (/*y*/ ctx[3] === undefined && !("y" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'y'");
    		}

    		if (/*color*/ ctx[4] === undefined && !("color" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'color'");
    		}

    		if (/*format*/ ctx[5] === undefined && !("format" in props)) {
    			console.warn("<PointInteractive> was created without expected prop 'format'");
    		}
    	}

    	get width() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get datum() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set datum(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get key() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set key(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get x() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get format() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get r() {
    		throw new Error("<PointInteractive>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set r(value) {
    		throw new Error("<PointInteractive>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const pi = Math.PI,
        tau = 2 * pi,
        epsilon = 1e-6,
        tauEpsilon = tau - epsilon;

    function Path() {
      this._x0 = this._y0 = // start of current subpath
      this._x1 = this._y1 = null; // end of current subpath
      this._ = "";
    }

    function path() {
      return new Path;
    }

    Path.prototype = path.prototype = {
      constructor: Path,
      moveTo: function(x, y) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y);
      },
      closePath: function() {
        if (this._x1 !== null) {
          this._x1 = this._x0, this._y1 = this._y0;
          this._ += "Z";
        }
      },
      lineTo: function(x, y) {
        this._ += "L" + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      quadraticCurveTo: function(x1, y1, x, y) {
        this._ += "Q" + (+x1) + "," + (+y1) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      bezierCurveTo: function(x1, y1, x2, y2, x, y) {
        this._ += "C" + (+x1) + "," + (+y1) + "," + (+x2) + "," + (+y2) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      arcTo: function(x1, y1, x2, y2, r) {
        x1 = +x1, y1 = +y1, x2 = +x2, y2 = +y2, r = +r;
        var x0 = this._x1,
            y0 = this._y1,
            x21 = x2 - x1,
            y21 = y2 - y1,
            x01 = x0 - x1,
            y01 = y0 - y1,
            l01_2 = x01 * x01 + y01 * y01;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x1,y1).
        if (this._x1 === null) {
          this._ += "M" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Or, is (x1,y1) coincident with (x0,y0)? Do nothing.
        else if (!(l01_2 > epsilon));

        // Or, are (x0,y0), (x1,y1) and (x2,y2) collinear?
        // Equivalently, is (x1,y1) coincident with (x2,y2)?
        // Or, is the radius zero? Line to (x1,y1).
        else if (!(Math.abs(y01 * x21 - y21 * x01) > epsilon) || !r) {
          this._ += "L" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Otherwise, draw an arc!
        else {
          var x20 = x2 - x0,
              y20 = y2 - y0,
              l21_2 = x21 * x21 + y21 * y21,
              l20_2 = x20 * x20 + y20 * y20,
              l21 = Math.sqrt(l21_2),
              l01 = Math.sqrt(l01_2),
              l = r * Math.tan((pi - Math.acos((l21_2 + l01_2 - l20_2) / (2 * l21 * l01))) / 2),
              t01 = l / l01,
              t21 = l / l21;

          // If the start tangent is not coincident with (x0,y0), line to.
          if (Math.abs(t01 - 1) > epsilon) {
            this._ += "L" + (x1 + t01 * x01) + "," + (y1 + t01 * y01);
          }

          this._ += "A" + r + "," + r + ",0,0," + (+(y01 * x20 > x01 * y20)) + "," + (this._x1 = x1 + t21 * x21) + "," + (this._y1 = y1 + t21 * y21);
        }
      },
      arc: function(x, y, r, a0, a1, ccw) {
        x = +x, y = +y, r = +r, ccw = !!ccw;
        var dx = r * Math.cos(a0),
            dy = r * Math.sin(a0),
            x0 = x + dx,
            y0 = y + dy,
            cw = 1 ^ ccw,
            da = ccw ? a0 - a1 : a1 - a0;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x0,y0).
        if (this._x1 === null) {
          this._ += "M" + x0 + "," + y0;
        }

        // Or, is (x0,y0) not coincident with the previous point? Line to (x0,y0).
        else if (Math.abs(this._x1 - x0) > epsilon || Math.abs(this._y1 - y0) > epsilon) {
          this._ += "L" + x0 + "," + y0;
        }

        // Is this arc empty? We’re done.
        if (!r) return;

        // Does the angle go the wrong way? Flip the direction.
        if (da < 0) da = da % tau + tau;

        // Is this a complete circle? Draw two arcs to complete the circle.
        if (da > tauEpsilon) {
          this._ += "A" + r + "," + r + ",0,1," + cw + "," + (x - dx) + "," + (y - dy) + "A" + r + "," + r + ",0,1," + cw + "," + (this._x1 = x0) + "," + (this._y1 = y0);
        }

        // Is this arc non-empty? Draw an arc!
        else if (da > epsilon) {
          this._ += "A" + r + "," + r + ",0," + (+(da >= pi)) + "," + cw + "," + (this._x1 = x + r * Math.cos(a1)) + "," + (this._y1 = y + r * Math.sin(a1));
        }
      },
      rect: function(x, y, w, h) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y) + "h" + (+w) + "v" + (+h) + "h" + (-w) + "Z";
      },
      toString: function() {
        return this._;
      }
    };

    function constant(x) {
      return function constant() {
        return x;
      };
    }

    function array(x) {
      return typeof x === "object" && "length" in x
        ? x // Array, TypedArray, NodeList, array-like
        : Array.from(x); // Map, Set, iterable, string, or anything else
    }

    function Linear(context) {
      this._context = context;
    }

    Linear.prototype = {
      areaStart: function() {
        this._line = 0;
      },
      areaEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line || (this._line !== 0 && this._point === 1)) this._context.closePath();
        this._line = 1 - this._line;
      },
      point: function(x, y) {
        x = +x, y = +y;
        switch (this._point) {
          case 0: this._point = 1; this._line ? this._context.lineTo(x, y) : this._context.moveTo(x, y); break;
          case 1: this._point = 2; // proceed
          default: this._context.lineTo(x, y); break;
        }
      }
    };

    function curveLinear(context) {
      return new Linear(context);
    }

    function x(p) {
      return p[0];
    }

    function y(p) {
      return p[1];
    }

    function line(x$1, y$1) {
      var defined = constant(true),
          context = null,
          curve = curveLinear,
          output = null;

      x$1 = typeof x$1 === "function" ? x$1 : (x$1 === undefined) ? x : constant(x$1);
      y$1 = typeof y$1 === "function" ? y$1 : (y$1 === undefined) ? y : constant(y$1);

      function line(data) {
        var i,
            n = (data = array(data)).length,
            d,
            defined0 = false,
            buffer;

        if (context == null) output = curve(buffer = path());

        for (i = 0; i <= n; ++i) {
          if (!(i < n && defined(d = data[i], i, data)) === defined0) {
            if (defined0 = !defined0) output.lineStart();
            else output.lineEnd();
          }
          if (defined0) output.point(+x$1(d, i, data), +y$1(d, i, data));
        }

        if (buffer) return output = null, buffer + "" || null;
      }

      line.x = function(_) {
        return arguments.length ? (x$1 = typeof _ === "function" ? _ : constant(+_), line) : x$1;
      };

      line.y = function(_) {
        return arguments.length ? (y$1 = typeof _ === "function" ? _ : constant(+_), line) : y$1;
      };

      line.defined = function(_) {
        return arguments.length ? (defined = typeof _ === "function" ? _ : constant(!!_), line) : defined;
      };

      line.curve = function(_) {
        return arguments.length ? (curve = _, context != null && (output = curve(context)), line) : curve;
      };

      line.context = function(_) {
        return arguments.length ? (_ == null ? context = output = null : output = curve(context = _), line) : context;
      };

      return line;
    }

    function Step(context, t) {
      this._context = context;
      this._t = t;
    }

    Step.prototype = {
      areaStart: function() {
        this._line = 0;
      },
      areaEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._x = this._y = NaN;
        this._point = 0;
      },
      lineEnd: function() {
        if (0 < this._t && this._t < 1 && this._point === 2) this._context.lineTo(this._x, this._y);
        if (this._line || (this._line !== 0 && this._point === 1)) this._context.closePath();
        if (this._line >= 0) this._t = 1 - this._t, this._line = 1 - this._line;
      },
      point: function(x, y) {
        x = +x, y = +y;
        switch (this._point) {
          case 0: this._point = 1; this._line ? this._context.lineTo(x, y) : this._context.moveTo(x, y); break;
          case 1: this._point = 2; // proceed
          default: {
            if (this._t <= 0) {
              this._context.lineTo(this._x, y);
              this._context.lineTo(x, y);
            } else {
              var x1 = this._x * (1 - this._t) + x * this._t;
              this._context.lineTo(x1, this._y);
              this._context.lineTo(x1, y);
            }
            break;
          }
        }
        this._x = x, this._y = y;
      }
    };

    function curveStep(context) {
      return new Step(context, 0.5);
    }

    function initRange(domain, range) {
      switch (arguments.length) {
        case 0: break;
        case 1: this.range(domain); break;
        default: this.range(range).domain(domain); break;
      }
      return this;
    }

    function define(constructor, factory, prototype) {
      constructor.prototype = factory.prototype = prototype;
      prototype.constructor = constructor;
    }

    function extend(parent, definition) {
      var prototype = Object.create(parent.prototype);
      for (var key in definition) prototype[key] = definition[key];
      return prototype;
    }

    function Color() {}

    var darker = 0.7;
    var brighter = 1 / darker;

    var reI = "\\s*([+-]?\\d+)\\s*",
        reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*",
        reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
        reHex = /^#([0-9a-f]{3,8})$/,
        reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`),
        reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`),
        reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`),
        reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`),
        reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`),
        reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`);

    var named = {
      aliceblue: 0xf0f8ff,
      antiquewhite: 0xfaebd7,
      aqua: 0x00ffff,
      aquamarine: 0x7fffd4,
      azure: 0xf0ffff,
      beige: 0xf5f5dc,
      bisque: 0xffe4c4,
      black: 0x000000,
      blanchedalmond: 0xffebcd,
      blue: 0x0000ff,
      blueviolet: 0x8a2be2,
      brown: 0xa52a2a,
      burlywood: 0xdeb887,
      cadetblue: 0x5f9ea0,
      chartreuse: 0x7fff00,
      chocolate: 0xd2691e,
      coral: 0xff7f50,
      cornflowerblue: 0x6495ed,
      cornsilk: 0xfff8dc,
      crimson: 0xdc143c,
      cyan: 0x00ffff,
      darkblue: 0x00008b,
      darkcyan: 0x008b8b,
      darkgoldenrod: 0xb8860b,
      darkgray: 0xa9a9a9,
      darkgreen: 0x006400,
      darkgrey: 0xa9a9a9,
      darkkhaki: 0xbdb76b,
      darkmagenta: 0x8b008b,
      darkolivegreen: 0x556b2f,
      darkorange: 0xff8c00,
      darkorchid: 0x9932cc,
      darkred: 0x8b0000,
      darksalmon: 0xe9967a,
      darkseagreen: 0x8fbc8f,
      darkslateblue: 0x483d8b,
      darkslategray: 0x2f4f4f,
      darkslategrey: 0x2f4f4f,
      darkturquoise: 0x00ced1,
      darkviolet: 0x9400d3,
      deeppink: 0xff1493,
      deepskyblue: 0x00bfff,
      dimgray: 0x696969,
      dimgrey: 0x696969,
      dodgerblue: 0x1e90ff,
      firebrick: 0xb22222,
      floralwhite: 0xfffaf0,
      forestgreen: 0x228b22,
      fuchsia: 0xff00ff,
      gainsboro: 0xdcdcdc,
      ghostwhite: 0xf8f8ff,
      gold: 0xffd700,
      goldenrod: 0xdaa520,
      gray: 0x808080,
      green: 0x008000,
      greenyellow: 0xadff2f,
      grey: 0x808080,
      honeydew: 0xf0fff0,
      hotpink: 0xff69b4,
      indianred: 0xcd5c5c,
      indigo: 0x4b0082,
      ivory: 0xfffff0,
      khaki: 0xf0e68c,
      lavender: 0xe6e6fa,
      lavenderblush: 0xfff0f5,
      lawngreen: 0x7cfc00,
      lemonchiffon: 0xfffacd,
      lightblue: 0xadd8e6,
      lightcoral: 0xf08080,
      lightcyan: 0xe0ffff,
      lightgoldenrodyellow: 0xfafad2,
      lightgray: 0xd3d3d3,
      lightgreen: 0x90ee90,
      lightgrey: 0xd3d3d3,
      lightpink: 0xffb6c1,
      lightsalmon: 0xffa07a,
      lightseagreen: 0x20b2aa,
      lightskyblue: 0x87cefa,
      lightslategray: 0x778899,
      lightslategrey: 0x778899,
      lightsteelblue: 0xb0c4de,
      lightyellow: 0xffffe0,
      lime: 0x00ff00,
      limegreen: 0x32cd32,
      linen: 0xfaf0e6,
      magenta: 0xff00ff,
      maroon: 0x800000,
      mediumaquamarine: 0x66cdaa,
      mediumblue: 0x0000cd,
      mediumorchid: 0xba55d3,
      mediumpurple: 0x9370db,
      mediumseagreen: 0x3cb371,
      mediumslateblue: 0x7b68ee,
      mediumspringgreen: 0x00fa9a,
      mediumturquoise: 0x48d1cc,
      mediumvioletred: 0xc71585,
      midnightblue: 0x191970,
      mintcream: 0xf5fffa,
      mistyrose: 0xffe4e1,
      moccasin: 0xffe4b5,
      navajowhite: 0xffdead,
      navy: 0x000080,
      oldlace: 0xfdf5e6,
      olive: 0x808000,
      olivedrab: 0x6b8e23,
      orange: 0xffa500,
      orangered: 0xff4500,
      orchid: 0xda70d6,
      palegoldenrod: 0xeee8aa,
      palegreen: 0x98fb98,
      paleturquoise: 0xafeeee,
      palevioletred: 0xdb7093,
      papayawhip: 0xffefd5,
      peachpuff: 0xffdab9,
      peru: 0xcd853f,
      pink: 0xffc0cb,
      plum: 0xdda0dd,
      powderblue: 0xb0e0e6,
      purple: 0x800080,
      rebeccapurple: 0x663399,
      red: 0xff0000,
      rosybrown: 0xbc8f8f,
      royalblue: 0x4169e1,
      saddlebrown: 0x8b4513,
      salmon: 0xfa8072,
      sandybrown: 0xf4a460,
      seagreen: 0x2e8b57,
      seashell: 0xfff5ee,
      sienna: 0xa0522d,
      silver: 0xc0c0c0,
      skyblue: 0x87ceeb,
      slateblue: 0x6a5acd,
      slategray: 0x708090,
      slategrey: 0x708090,
      snow: 0xfffafa,
      springgreen: 0x00ff7f,
      steelblue: 0x4682b4,
      tan: 0xd2b48c,
      teal: 0x008080,
      thistle: 0xd8bfd8,
      tomato: 0xff6347,
      turquoise: 0x40e0d0,
      violet: 0xee82ee,
      wheat: 0xf5deb3,
      white: 0xffffff,
      whitesmoke: 0xf5f5f5,
      yellow: 0xffff00,
      yellowgreen: 0x9acd32
    };

    define(Color, color, {
      copy(channels) {
        return Object.assign(new this.constructor, this, channels);
      },
      displayable() {
        return this.rgb().displayable();
      },
      hex: color_formatHex, // Deprecated! Use color.formatHex.
      formatHex: color_formatHex,
      formatHex8: color_formatHex8,
      formatHsl: color_formatHsl,
      formatRgb: color_formatRgb,
      toString: color_formatRgb
    });

    function color_formatHex() {
      return this.rgb().formatHex();
    }

    function color_formatHex8() {
      return this.rgb().formatHex8();
    }

    function color_formatHsl() {
      return hslConvert(this).formatHsl();
    }

    function color_formatRgb() {
      return this.rgb().formatRgb();
    }

    function color(format) {
      var m, l;
      format = (format + "").trim().toLowerCase();
      return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
          : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
          : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
          : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
          : null) // invalid hex
          : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
          : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
          : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
          : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
          : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
          : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
          : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
          : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
          : null;
    }

    function rgbn(n) {
      return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
    }

    function rgba(r, g, b, a) {
      if (a <= 0) r = g = b = NaN;
      return new Rgb(r, g, b, a);
    }

    function rgbConvert(o) {
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Rgb;
      o = o.rgb();
      return new Rgb(o.r, o.g, o.b, o.opacity);
    }

    function rgb(r, g, b, opacity) {
      return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
    }

    function Rgb(r, g, b, opacity) {
      this.r = +r;
      this.g = +g;
      this.b = +b;
      this.opacity = +opacity;
    }

    define(Rgb, rgb, extend(Color, {
      brighter(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      darker(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      rgb() {
        return this;
      },
      clamp() {
        return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
      },
      displayable() {
        return (-0.5 <= this.r && this.r < 255.5)
            && (-0.5 <= this.g && this.g < 255.5)
            && (-0.5 <= this.b && this.b < 255.5)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      hex: rgb_formatHex, // Deprecated! Use color.formatHex.
      formatHex: rgb_formatHex,
      formatHex8: rgb_formatHex8,
      formatRgb: rgb_formatRgb,
      toString: rgb_formatRgb
    }));

    function rgb_formatHex() {
      return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
    }

    function rgb_formatHex8() {
      return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
    }

    function rgb_formatRgb() {
      const a = clampa(this.opacity);
      return `${a === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a === 1 ? ")" : `, ${a})`}`;
    }

    function clampa(opacity) {
      return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
    }

    function clampi(value) {
      return Math.max(0, Math.min(255, Math.round(value) || 0));
    }

    function hex(value) {
      value = clampi(value);
      return (value < 16 ? "0" : "") + value.toString(16);
    }

    function hsla(h, s, l, a) {
      if (a <= 0) h = s = l = NaN;
      else if (l <= 0 || l >= 1) h = s = NaN;
      else if (s <= 0) h = NaN;
      return new Hsl(h, s, l, a);
    }

    function hslConvert(o) {
      if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Hsl;
      if (o instanceof Hsl) return o;
      o = o.rgb();
      var r = o.r / 255,
          g = o.g / 255,
          b = o.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          h = NaN,
          s = max - min,
          l = (max + min) / 2;
      if (s) {
        if (r === max) h = (g - b) / s + (g < b) * 6;
        else if (g === max) h = (b - r) / s + 2;
        else h = (r - g) / s + 4;
        s /= l < 0.5 ? max + min : 2 - max - min;
        h *= 60;
      } else {
        s = l > 0 && l < 1 ? 0 : h;
      }
      return new Hsl(h, s, l, o.opacity);
    }

    function hsl(h, s, l, opacity) {
      return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
    }

    function Hsl(h, s, l, opacity) {
      this.h = +h;
      this.s = +s;
      this.l = +l;
      this.opacity = +opacity;
    }

    define(Hsl, hsl, extend(Color, {
      brighter(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      darker(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      rgb() {
        var h = this.h % 360 + (this.h < 0) * 360,
            s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
            l = this.l,
            m2 = l + (l < 0.5 ? l : 1 - l) * s,
            m1 = 2 * l - m2;
        return new Rgb(
          hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
          hsl2rgb(h, m1, m2),
          hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
          this.opacity
        );
      },
      clamp() {
        return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
      },
      displayable() {
        return (0 <= this.s && this.s <= 1 || isNaN(this.s))
            && (0 <= this.l && this.l <= 1)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      formatHsl() {
        const a = clampa(this.opacity);
        return `${a === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a === 1 ? ")" : `, ${a})`}`;
      }
    }));

    function clamph(value) {
      value = (value || 0) % 360;
      return value < 0 ? value + 360 : value;
    }

    function clampt(value) {
      return Math.max(0, Math.min(1, value || 0));
    }

    /* From FvD 13.37, CSS Color Module Level 3 */
    function hsl2rgb(h, m1, m2) {
      return (h < 60 ? m1 + (m2 - m1) * h / 60
          : h < 180 ? m2
          : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
          : m1) * 255;
    }

    var constant$1 = x => () => x;

    function linear(a, d) {
      return function(t) {
        return a + t * d;
      };
    }

    function exponential(a, b, y) {
      return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
        return Math.pow(a + t * b, y);
      };
    }

    function gamma(y) {
      return (y = +y) === 1 ? nogamma : function(a, b) {
        return b - a ? exponential(a, b, y) : constant$1(isNaN(a) ? b : a);
      };
    }

    function nogamma(a, b) {
      var d = b - a;
      return d ? linear(a, d) : constant$1(isNaN(a) ? b : a);
    }

    var rgb$1 = (function rgbGamma(y) {
      var color = gamma(y);

      function rgb$1(start, end) {
        var r = color((start = rgb(start)).r, (end = rgb(end)).r),
            g = color(start.g, end.g),
            b = color(start.b, end.b),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.r = r(t);
          start.g = g(t);
          start.b = b(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }

      rgb$1.gamma = rgbGamma;

      return rgb$1;
    })(1);

    function numberArray(a, b) {
      if (!b) b = [];
      var n = a ? Math.min(b.length, a.length) : 0,
          c = b.slice(),
          i;
      return function(t) {
        for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
        return c;
      };
    }

    function isNumberArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }

    function genericArray(a, b) {
      var nb = b ? b.length : 0,
          na = a ? Math.min(nb, a.length) : 0,
          x = new Array(na),
          c = new Array(nb),
          i;

      for (i = 0; i < na; ++i) x[i] = interpolate(a[i], b[i]);
      for (; i < nb; ++i) c[i] = b[i];

      return function(t) {
        for (i = 0; i < na; ++i) c[i] = x[i](t);
        return c;
      };
    }

    function date(a, b) {
      var d = new Date;
      return a = +a, b = +b, function(t) {
        return d.setTime(a * (1 - t) + b * t), d;
      };
    }

    function interpolateNumber(a, b) {
      return a = +a, b = +b, function(t) {
        return a * (1 - t) + b * t;
      };
    }

    function object(a, b) {
      var i = {},
          c = {},
          k;

      if (a === null || typeof a !== "object") a = {};
      if (b === null || typeof b !== "object") b = {};

      for (k in b) {
        if (k in a) {
          i[k] = interpolate(a[k], b[k]);
        } else {
          c[k] = b[k];
        }
      }

      return function(t) {
        for (k in i) c[k] = i[k](t);
        return c;
      };
    }

    var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
        reB = new RegExp(reA.source, "g");

    function zero(b) {
      return function() {
        return b;
      };
    }

    function one(b) {
      return function(t) {
        return b(t) + "";
      };
    }

    function string(a, b) {
      var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
          am, // current match in a
          bm, // current match in b
          bs, // string preceding current number in b, if any
          i = -1, // index in s
          s = [], // string constants and placeholders
          q = []; // number interpolators

      // Coerce inputs to strings.
      a = a + "", b = b + "";

      // Interpolate pairs of numbers in a & b.
      while ((am = reA.exec(a))
          && (bm = reB.exec(b))) {
        if ((bs = bm.index) > bi) { // a string precedes the next number in b
          bs = b.slice(bi, bs);
          if (s[i]) s[i] += bs; // coalesce with previous string
          else s[++i] = bs;
        }
        if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
          if (s[i]) s[i] += bm; // coalesce with previous string
          else s[++i] = bm;
        } else { // interpolate non-matching numbers
          s[++i] = null;
          q.push({i: i, x: interpolateNumber(am, bm)});
        }
        bi = reB.lastIndex;
      }

      // Add remains of b.
      if (bi < b.length) {
        bs = b.slice(bi);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      }

      // Special optimization for only a single match.
      // Otherwise, interpolate each of the numbers and rejoin the string.
      return s.length < 2 ? (q[0]
          ? one(q[0].x)
          : zero(b))
          : (b = q.length, function(t) {
              for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
              return s.join("");
            });
    }

    function interpolate(a, b) {
      var t = typeof b, c;
      return b == null || t === "boolean" ? constant$1(b)
          : (t === "number" ? interpolateNumber
          : t === "string" ? ((c = color(b)) ? (b = c, rgb$1) : string)
          : b instanceof color ? rgb$1
          : b instanceof Date ? date
          : isNumberArray(b) ? numberArray
          : Array.isArray(b) ? genericArray
          : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
          : interpolateNumber)(a, b);
    }

    function interpolateRound(a, b) {
      return a = +a, b = +b, function(t) {
        return Math.round(a * (1 - t) + b * t);
      };
    }

    function constants(x) {
      return function() {
        return x;
      };
    }

    function number(x) {
      return +x;
    }

    var unit = [0, 1];

    function identity(x) {
      return x;
    }

    function normalize(a, b) {
      return (b -= (a = +a))
          ? function(x) { return (x - a) / b; }
          : constants(isNaN(b) ? NaN : 0.5);
    }

    function clamper(a, b) {
      var t;
      if (a > b) t = a, a = b, b = t;
      return function(x) { return Math.max(a, Math.min(b, x)); };
    }

    // normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
    // interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
    function bimap(domain, range, interpolate) {
      var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
      if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);
      else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
      return function(x) { return r0(d0(x)); };
    }

    function polymap(domain, range, interpolate) {
      var j = Math.min(domain.length, range.length) - 1,
          d = new Array(j),
          r = new Array(j),
          i = -1;

      // Reverse descending domains.
      if (domain[j] < domain[0]) {
        domain = domain.slice().reverse();
        range = range.slice().reverse();
      }

      while (++i < j) {
        d[i] = normalize(domain[i], domain[i + 1]);
        r[i] = interpolate(range[i], range[i + 1]);
      }

      return function(x) {
        var i = d3Array.bisect(domain, x, 1, j) - 1;
        return r[i](d[i](x));
      };
    }

    function copy(source, target) {
      return target
          .domain(source.domain())
          .range(source.range())
          .interpolate(source.interpolate())
          .clamp(source.clamp())
          .unknown(source.unknown());
    }

    function transformer() {
      var domain = unit,
          range = unit,
          interpolate$1 = interpolate,
          transform,
          untransform,
          unknown,
          clamp = identity,
          piecewise,
          output,
          input;

      function rescale() {
        var n = Math.min(domain.length, range.length);
        if (clamp !== identity) clamp = clamper(domain[0], domain[n - 1]);
        piecewise = n > 2 ? polymap : bimap;
        output = input = null;
        return scale;
      }

      function scale(x) {
        return x == null || isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate$1)))(transform(clamp(x)));
      }

      scale.invert = function(y) {
        return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
      };

      scale.domain = function(_) {
        return arguments.length ? (domain = Array.from(_, number), rescale()) : domain.slice();
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), rescale()) : range.slice();
      };

      scale.rangeRound = function(_) {
        return range = Array.from(_), interpolate$1 = interpolateRound, rescale();
      };

      scale.clamp = function(_) {
        return arguments.length ? (clamp = _ ? true : identity, rescale()) : clamp !== identity;
      };

      scale.interpolate = function(_) {
        return arguments.length ? (interpolate$1 = _, rescale()) : interpolate$1;
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      return function(t, u) {
        transform = t, untransform = u;
        return rescale();
      };
    }

    function continuous() {
      return transformer()(identity, identity);
    }

    function formatDecimal(x) {
      return Math.abs(x = Math.round(x)) >= 1e21
          ? x.toLocaleString("en").replace(/,/g, "")
          : x.toString(10);
    }

    // Computes the decimal coefficient and exponent of the specified number x with
    // significant digits p, where x is positive and p is in [1, 21] or undefined.
    // For example, formatDecimalParts(1.23) returns ["123", 0].
    function formatDecimalParts(x, p) {
      if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
      var i, coefficient = x.slice(0, i);

      // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
      // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
      return [
        coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
        +x.slice(i + 1)
      ];
    }

    function exponent(x) {
      return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
    }

    function formatGroup(grouping, thousands) {
      return function(value, width) {
        var i = value.length,
            t = [],
            j = 0,
            g = grouping[0],
            length = 0;

        while (i > 0 && g > 0) {
          if (length + g + 1 > width) g = Math.max(1, width - length);
          t.push(value.substring(i -= g, i + g));
          if ((length += g + 1) > width) break;
          g = grouping[j = (j + 1) % grouping.length];
        }

        return t.reverse().join(thousands);
      };
    }

    function formatNumerals(numerals) {
      return function(value) {
        return value.replace(/[0-9]/g, function(i) {
          return numerals[+i];
        });
      };
    }

    // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
    var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

    function formatSpecifier(specifier) {
      if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
      var match;
      return new FormatSpecifier({
        fill: match[1],
        align: match[2],
        sign: match[3],
        symbol: match[4],
        zero: match[5],
        width: match[6],
        comma: match[7],
        precision: match[8] && match[8].slice(1),
        trim: match[9],
        type: match[10]
      });
    }

    formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

    function FormatSpecifier(specifier) {
      this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
      this.align = specifier.align === undefined ? ">" : specifier.align + "";
      this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
      this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
      this.zero = !!specifier.zero;
      this.width = specifier.width === undefined ? undefined : +specifier.width;
      this.comma = !!specifier.comma;
      this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
      this.trim = !!specifier.trim;
      this.type = specifier.type === undefined ? "" : specifier.type + "";
    }

    FormatSpecifier.prototype.toString = function() {
      return this.fill
          + this.align
          + this.sign
          + this.symbol
          + (this.zero ? "0" : "")
          + (this.width === undefined ? "" : Math.max(1, this.width | 0))
          + (this.comma ? "," : "")
          + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
          + (this.trim ? "~" : "")
          + this.type;
    };

    // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
    function formatTrim(s) {
      out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
        switch (s[i]) {
          case ".": i0 = i1 = i; break;
          case "0": if (i0 === 0) i0 = i; i1 = i; break;
          default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
        }
      }
      return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    var prefixExponent;

    function formatPrefixAuto(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1],
          i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
          n = coefficient.length;
      return i === n ? coefficient
          : i > n ? coefficient + new Array(i - n + 1).join("0")
          : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
          : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
    }

    function formatRounded(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1];
      return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
          : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
          : coefficient + new Array(exponent - coefficient.length + 2).join("0");
    }

    var formatTypes = {
      "%": (x, p) => (x * 100).toFixed(p),
      "b": (x) => Math.round(x).toString(2),
      "c": (x) => x + "",
      "d": formatDecimal,
      "e": (x, p) => x.toExponential(p),
      "f": (x, p) => x.toFixed(p),
      "g": (x, p) => x.toPrecision(p),
      "o": (x) => Math.round(x).toString(8),
      "p": (x, p) => formatRounded(x * 100, p),
      "r": formatRounded,
      "s": formatPrefixAuto,
      "X": (x) => Math.round(x).toString(16).toUpperCase(),
      "x": (x) => Math.round(x).toString(16)
    };

    function identity$1(x) {
      return x;
    }

    var map = Array.prototype.map,
        prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

    function formatLocale(locale) {
      var group = locale.grouping === undefined || locale.thousands === undefined ? identity$1 : formatGroup(map.call(locale.grouping, Number), locale.thousands + ""),
          currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
          currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
          decimal = locale.decimal === undefined ? "." : locale.decimal + "",
          numerals = locale.numerals === undefined ? identity$1 : formatNumerals(map.call(locale.numerals, String)),
          percent = locale.percent === undefined ? "%" : locale.percent + "",
          minus = locale.minus === undefined ? "−" : locale.minus + "",
          nan = locale.nan === undefined ? "NaN" : locale.nan + "";

      function newFormat(specifier) {
        specifier = formatSpecifier(specifier);

        var fill = specifier.fill,
            align = specifier.align,
            sign = specifier.sign,
            symbol = specifier.symbol,
            zero = specifier.zero,
            width = specifier.width,
            comma = specifier.comma,
            precision = specifier.precision,
            trim = specifier.trim,
            type = specifier.type;

        // The "n" type is an alias for ",g".
        if (type === "n") comma = true, type = "g";

        // The "" type, and any invalid type, is an alias for ".12~g".
        else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

        // If zero fill is specified, padding goes after sign and before digits.
        if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

        // Compute the prefix and suffix.
        // For SI-prefix, the suffix is lazily computed.
        var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
            suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

        // What format function should we use?
        // Is this an integer type?
        // Can this type generate exponential notation?
        var formatType = formatTypes[type],
            maybeSuffix = /[defgprs%]/.test(type);

        // Set the default precision if not specified,
        // or clamp the specified precision to the supported range.
        // For significant precision, it must be in [1, 21].
        // For fixed precision, it must be in [0, 20].
        precision = precision === undefined ? 6
            : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
            : Math.max(0, Math.min(20, precision));

        function format(value) {
          var valuePrefix = prefix,
              valueSuffix = suffix,
              i, n, c;

          if (type === "c") {
            valueSuffix = formatType(value) + valueSuffix;
            value = "";
          } else {
            value = +value;

            // Determine the sign. -0 is not less than 0, but 1 / -0 is!
            var valueNegative = value < 0 || 1 / value < 0;

            // Perform the initial formatting.
            value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

            // Trim insignificant zeros.
            if (trim) value = formatTrim(value);

            // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.
            if (valueNegative && +value === 0 && sign !== "+") valueNegative = false;

            // Compute the prefix and suffix.
            valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
            valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

            // Break the formatted value into the integer “value” part that can be
            // grouped, and fractional or exponential “suffix” part that is not.
            if (maybeSuffix) {
              i = -1, n = value.length;
              while (++i < n) {
                if (c = value.charCodeAt(i), 48 > c || c > 57) {
                  valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                  value = value.slice(0, i);
                  break;
                }
              }
            }
          }

          // If the fill character is not "0", grouping is applied before padding.
          if (comma && !zero) value = group(value, Infinity);

          // Compute the padding.
          var length = valuePrefix.length + value.length + valueSuffix.length,
              padding = length < width ? new Array(width - length + 1).join(fill) : "";

          // If the fill character is "0", grouping is applied after padding.
          if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

          // Reconstruct the final output based on the desired alignment.
          switch (align) {
            case "<": value = valuePrefix + value + valueSuffix + padding; break;
            case "=": value = valuePrefix + padding + value + valueSuffix; break;
            case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
            default: value = padding + valuePrefix + value + valueSuffix; break;
          }

          return numerals(value);
        }

        format.toString = function() {
          return specifier + "";
        };

        return format;
      }

      function formatPrefix(specifier, value) {
        var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
            e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
            k = Math.pow(10, -e),
            prefix = prefixes[8 + e / 3];
        return function(value) {
          return f(k * value) + prefix;
        };
      }

      return {
        format: newFormat,
        formatPrefix: formatPrefix
      };
    }

    var locale;
    var format;
    var formatPrefix;

    defaultLocale({
      thousands: ",",
      grouping: [3],
      currency: ["$", ""]
    });

    function defaultLocale(definition) {
      locale = formatLocale(definition);
      format = locale.format;
      formatPrefix = locale.formatPrefix;
      return locale;
    }

    function precisionFixed(step) {
      return Math.max(0, -exponent(Math.abs(step)));
    }

    function precisionPrefix(step, value) {
      return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
    }

    function precisionRound(step, max) {
      step = Math.abs(step), max = Math.abs(max) - step;
      return Math.max(0, exponent(max) - exponent(step)) + 1;
    }

    function tickFormat(start, stop, count, specifier) {
      var step = d3Array.tickStep(start, stop, count),
          precision;
      specifier = formatSpecifier(specifier == null ? ",f" : specifier);
      switch (specifier.type) {
        case "s": {
          var value = Math.max(Math.abs(start), Math.abs(stop));
          if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
          return formatPrefix(specifier, value);
        }
        case "":
        case "e":
        case "g":
        case "p":
        case "r": {
          if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
          break;
        }
        case "f":
        case "%": {
          if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
          break;
        }
      }
      return format(specifier);
    }

    function linearish(scale) {
      var domain = scale.domain;

      scale.ticks = function(count) {
        var d = domain();
        return d3Array.ticks(d[0], d[d.length - 1], count == null ? 10 : count);
      };

      scale.tickFormat = function(count, specifier) {
        var d = domain();
        return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
      };

      scale.nice = function(count) {
        if (count == null) count = 10;

        var d = domain();
        var i0 = 0;
        var i1 = d.length - 1;
        var start = d[i0];
        var stop = d[i1];
        var prestep;
        var step;
        var maxIter = 10;

        if (stop < start) {
          step = start, start = stop, stop = step;
          step = i0, i0 = i1, i1 = step;
        }
        
        while (maxIter-- > 0) {
          step = d3Array.tickIncrement(start, stop, count);
          if (step === prestep) {
            d[i0] = start;
            d[i1] = stop;
            return domain(d);
          } else if (step > 0) {
            start = Math.floor(start / step) * step;
            stop = Math.ceil(stop / step) * step;
          } else if (step < 0) {
            start = Math.ceil(start * step) / step;
            stop = Math.floor(stop * step) / step;
          } else {
            break;
          }
          prestep = step;
        }

        return scale;
      };

      return scale;
    }

    function linear$1() {
      var scale = continuous();

      scale.copy = function() {
        return copy(scale, linear$1());
      };

      initRange.apply(scale, arguments);

      return linearish(scale);
    }

    function nice(domain, interval) {
      domain = domain.slice();

      var i0 = 0,
          i1 = domain.length - 1,
          x0 = domain[i0],
          x1 = domain[i1],
          t;

      if (x1 < x0) {
        t = i0, i0 = i1, i1 = t;
        t = x0, x0 = x1, x1 = t;
      }

      domain[i0] = interval.floor(x0);
      domain[i1] = interval.ceil(x1);
      return domain;
    }

    const t0 = new Date, t1 = new Date;

    function timeInterval(floori, offseti, count, field) {

      function interval(date) {
        return floori(date = arguments.length === 0 ? new Date : new Date(+date)), date;
      }

      interval.floor = (date) => {
        return floori(date = new Date(+date)), date;
      };

      interval.ceil = (date) => {
        return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
      };

      interval.round = (date) => {
        const d0 = interval(date), d1 = interval.ceil(date);
        return date - d0 < d1 - date ? d0 : d1;
      };

      interval.offset = (date, step) => {
        return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
      };

      interval.range = (start, stop, step) => {
        const range = [];
        start = interval.ceil(start);
        step = step == null ? 1 : Math.floor(step);
        if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
        let previous;
        do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
        while (previous < start && start < stop);
        return range;
      };

      interval.filter = (test) => {
        return timeInterval((date) => {
          if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
        }, (date, step) => {
          if (date >= date) {
            if (step < 0) while (++step <= 0) {
              while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
            } else while (--step >= 0) {
              while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
            }
          }
        });
      };

      if (count) {
        interval.count = (start, end) => {
          t0.setTime(+start), t1.setTime(+end);
          floori(t0), floori(t1);
          return Math.floor(count(t0, t1));
        };

        interval.every = (step) => {
          step = Math.floor(step);
          return !isFinite(step) || !(step > 0) ? null
              : !(step > 1) ? interval
              : interval.filter(field
                  ? (d) => field(d) % step === 0
                  : (d) => interval.count(0, d) % step === 0);
        };
      }

      return interval;
    }

    const millisecond = timeInterval(() => {
      // noop
    }, (date, step) => {
      date.setTime(+date + step);
    }, (start, end) => {
      return end - start;
    });

    // An optimized implementation for this simple case.
    millisecond.every = (k) => {
      k = Math.floor(k);
      if (!isFinite(k) || !(k > 0)) return null;
      if (!(k > 1)) return millisecond;
      return timeInterval((date) => {
        date.setTime(Math.floor(date / k) * k);
      }, (date, step) => {
        date.setTime(+date + step * k);
      }, (start, end) => {
        return (end - start) / k;
      });
    };

    const durationSecond = 1000;
    const durationMinute = durationSecond * 60;
    const durationHour = durationMinute * 60;
    const durationDay = durationHour * 24;
    const durationWeek = durationDay * 7;
    const durationMonth = durationDay * 30;
    const durationYear = durationDay * 365;

    const second = timeInterval((date) => {
      date.setTime(date - date.getMilliseconds());
    }, (date, step) => {
      date.setTime(+date + step * durationSecond);
    }, (start, end) => {
      return (end - start) / durationSecond;
    }, (date) => {
      return date.getUTCSeconds();
    });

    const timeMinute = timeInterval((date) => {
      date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond);
    }, (date, step) => {
      date.setTime(+date + step * durationMinute);
    }, (start, end) => {
      return (end - start) / durationMinute;
    }, (date) => {
      return date.getMinutes();
    });

    const utcMinute = timeInterval((date) => {
      date.setUTCSeconds(0, 0);
    }, (date, step) => {
      date.setTime(+date + step * durationMinute);
    }, (start, end) => {
      return (end - start) / durationMinute;
    }, (date) => {
      return date.getUTCMinutes();
    });

    const timeHour = timeInterval((date) => {
      date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond - date.getMinutes() * durationMinute);
    }, (date, step) => {
      date.setTime(+date + step * durationHour);
    }, (start, end) => {
      return (end - start) / durationHour;
    }, (date) => {
      return date.getHours();
    });

    const utcHour = timeInterval((date) => {
      date.setUTCMinutes(0, 0, 0);
    }, (date, step) => {
      date.setTime(+date + step * durationHour);
    }, (start, end) => {
      return (end - start) / durationHour;
    }, (date) => {
      return date.getUTCHours();
    });

    const timeDay = timeInterval(
      date => date.setHours(0, 0, 0, 0),
      (date, step) => date.setDate(date.getDate() + step),
      (start, end) => (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationDay,
      date => date.getDate() - 1
    );

    const utcDay = timeInterval((date) => {
      date.setUTCHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setUTCDate(date.getUTCDate() + step);
    }, (start, end) => {
      return (end - start) / durationDay;
    }, (date) => {
      return date.getUTCDate() - 1;
    });

    const unixDay = timeInterval((date) => {
      date.setUTCHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setUTCDate(date.getUTCDate() + step);
    }, (start, end) => {
      return (end - start) / durationDay;
    }, (date) => {
      return Math.floor(date / durationDay);
    });

    function timeWeekday(i) {
      return timeInterval((date) => {
        date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
        date.setHours(0, 0, 0, 0);
      }, (date, step) => {
        date.setDate(date.getDate() + step * 7);
      }, (start, end) => {
        return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationWeek;
      });
    }

    const timeSunday = timeWeekday(0);
    const timeMonday = timeWeekday(1);
    const timeTuesday = timeWeekday(2);
    const timeWednesday = timeWeekday(3);
    const timeThursday = timeWeekday(4);
    const timeFriday = timeWeekday(5);
    const timeSaturday = timeWeekday(6);

    function utcWeekday(i) {
      return timeInterval((date) => {
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
        date.setUTCHours(0, 0, 0, 0);
      }, (date, step) => {
        date.setUTCDate(date.getUTCDate() + step * 7);
      }, (start, end) => {
        return (end - start) / durationWeek;
      });
    }

    const utcSunday = utcWeekday(0);
    const utcMonday = utcWeekday(1);
    const utcTuesday = utcWeekday(2);
    const utcWednesday = utcWeekday(3);
    const utcThursday = utcWeekday(4);
    const utcFriday = utcWeekday(5);
    const utcSaturday = utcWeekday(6);

    const timeMonth = timeInterval((date) => {
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setMonth(date.getMonth() + step);
    }, (start, end) => {
      return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
    }, (date) => {
      return date.getMonth();
    });

    const utcMonth = timeInterval((date) => {
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setUTCMonth(date.getUTCMonth() + step);
    }, (start, end) => {
      return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
    }, (date) => {
      return date.getUTCMonth();
    });

    const timeYear = timeInterval((date) => {
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setFullYear(date.getFullYear() + step);
    }, (start, end) => {
      return end.getFullYear() - start.getFullYear();
    }, (date) => {
      return date.getFullYear();
    });

    // An optimized implementation for this simple case.
    timeYear.every = (k) => {
      return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : timeInterval((date) => {
        date.setFullYear(Math.floor(date.getFullYear() / k) * k);
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
      }, (date, step) => {
        date.setFullYear(date.getFullYear() + step * k);
      });
    };

    const utcYear = timeInterval((date) => {
      date.setUTCMonth(0, 1);
      date.setUTCHours(0, 0, 0, 0);
    }, (date, step) => {
      date.setUTCFullYear(date.getUTCFullYear() + step);
    }, (start, end) => {
      return end.getUTCFullYear() - start.getUTCFullYear();
    }, (date) => {
      return date.getUTCFullYear();
    });

    // An optimized implementation for this simple case.
    utcYear.every = (k) => {
      return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : timeInterval((date) => {
        date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
        date.setUTCMonth(0, 1);
        date.setUTCHours(0, 0, 0, 0);
      }, (date, step) => {
        date.setUTCFullYear(date.getUTCFullYear() + step * k);
      });
    };

    function ticker(year, month, week, day, hour, minute) {

      const tickIntervals = [
        [second,  1,      durationSecond],
        [second,  5,  5 * durationSecond],
        [second, 15, 15 * durationSecond],
        [second, 30, 30 * durationSecond],
        [minute,  1,      durationMinute],
        [minute,  5,  5 * durationMinute],
        [minute, 15, 15 * durationMinute],
        [minute, 30, 30 * durationMinute],
        [  hour,  1,      durationHour  ],
        [  hour,  3,  3 * durationHour  ],
        [  hour,  6,  6 * durationHour  ],
        [  hour, 12, 12 * durationHour  ],
        [   day,  1,      durationDay   ],
        [   day,  2,  2 * durationDay   ],
        [  week,  1,      durationWeek  ],
        [ month,  1,      durationMonth ],
        [ month,  3,  3 * durationMonth ],
        [  year,  1,      durationYear  ]
      ];

      function ticks(start, stop, count) {
        const reverse = stop < start;
        if (reverse) [start, stop] = [stop, start];
        const interval = count && typeof count.range === "function" ? count : tickInterval(start, stop, count);
        const ticks = interval ? interval.range(start, +stop + 1) : []; // inclusive stop
        return reverse ? ticks.reverse() : ticks;
      }

      function tickInterval(start, stop, count) {
        const target = Math.abs(stop - start) / count;
        const i = d3Array.bisector(([,, step]) => step).right(tickIntervals, target);
        if (i === tickIntervals.length) return year.every(d3Array.tickStep(start / durationYear, stop / durationYear, count));
        if (i === 0) return millisecond.every(Math.max(d3Array.tickStep(start, stop, count), 1));
        const [t, step] = tickIntervals[target / tickIntervals[i - 1][2] < tickIntervals[i][2] / target ? i - 1 : i];
        return t.every(step);
      }

      return [ticks, tickInterval];
    }
    const [timeTicks, timeTickInterval] = ticker(timeYear, timeMonth, timeSunday, timeDay, timeHour, timeMinute);

    var t0$1 = new Date,
        t1$1 = new Date;

    function newInterval(floori, offseti, count, field) {

      function interval(date) {
        return floori(date = arguments.length === 0 ? new Date : new Date(+date)), date;
      }

      interval.floor = function(date) {
        return floori(date = new Date(+date)), date;
      };

      interval.ceil = function(date) {
        return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
      };

      interval.round = function(date) {
        var d0 = interval(date),
            d1 = interval.ceil(date);
        return date - d0 < d1 - date ? d0 : d1;
      };

      interval.offset = function(date, step) {
        return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
      };

      interval.range = function(start, stop, step) {
        var range = [], previous;
        start = interval.ceil(start);
        step = step == null ? 1 : Math.floor(step);
        if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
        do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
        while (previous < start && start < stop);
        return range;
      };

      interval.filter = function(test) {
        return newInterval(function(date) {
          if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
        }, function(date, step) {
          if (date >= date) {
            if (step < 0) while (++step <= 0) {
              while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
            } else while (--step >= 0) {
              while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
            }
          }
        });
      };

      if (count) {
        interval.count = function(start, end) {
          t0$1.setTime(+start), t1$1.setTime(+end);
          floori(t0$1), floori(t1$1);
          return Math.floor(count(t0$1, t1$1));
        };

        interval.every = function(step) {
          step = Math.floor(step);
          return !isFinite(step) || !(step > 0) ? null
              : !(step > 1) ? interval
              : interval.filter(field
                  ? function(d) { return field(d) % step === 0; }
                  : function(d) { return interval.count(0, d) % step === 0; });
        };
      }

      return interval;
    }

    const durationSecond$1 = 1000;
    const durationMinute$1 = durationSecond$1 * 60;
    const durationHour$1 = durationMinute$1 * 60;
    const durationDay$1 = durationHour$1 * 24;
    const durationWeek$1 = durationDay$1 * 7;

    var day = newInterval(
      date => date.setHours(0, 0, 0, 0),
      (date, step) => date.setDate(date.getDate() + step),
      (start, end) => (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute$1) / durationDay$1,
      date => date.getDate() - 1
    );

    function weekday(i) {
      return newInterval(function(date) {
        date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
        date.setHours(0, 0, 0, 0);
      }, function(date, step) {
        date.setDate(date.getDate() + step * 7);
      }, function(start, end) {
        return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute$1) / durationWeek$1;
      });
    }

    var sunday = weekday(0);
    var monday = weekday(1);
    var tuesday = weekday(2);
    var wednesday = weekday(3);
    var thursday = weekday(4);
    var friday = weekday(5);
    var saturday = weekday(6);

    var year = newInterval(function(date) {
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setFullYear(date.getFullYear() + step);
    }, function(start, end) {
      return end.getFullYear() - start.getFullYear();
    }, function(date) {
      return date.getFullYear();
    });

    // An optimized implementation for this simple case.
    year.every = function(k) {
      return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
        date.setFullYear(Math.floor(date.getFullYear() / k) * k);
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
      }, function(date, step) {
        date.setFullYear(date.getFullYear() + step * k);
      });
    };

    var utcDay$1 = newInterval(function(date) {
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCDate(date.getUTCDate() + step);
    }, function(start, end) {
      return (end - start) / durationDay$1;
    }, function(date) {
      return date.getUTCDate() - 1;
    });

    function utcWeekday$1(i) {
      return newInterval(function(date) {
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
        date.setUTCHours(0, 0, 0, 0);
      }, function(date, step) {
        date.setUTCDate(date.getUTCDate() + step * 7);
      }, function(start, end) {
        return (end - start) / durationWeek$1;
      });
    }

    var utcSunday$1 = utcWeekday$1(0);
    var utcMonday$1 = utcWeekday$1(1);
    var utcTuesday$1 = utcWeekday$1(2);
    var utcWednesday$1 = utcWeekday$1(3);
    var utcThursday$1 = utcWeekday$1(4);
    var utcFriday$1 = utcWeekday$1(5);
    var utcSaturday$1 = utcWeekday$1(6);

    var utcYear$1 = newInterval(function(date) {
      date.setUTCMonth(0, 1);
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCFullYear(date.getUTCFullYear() + step);
    }, function(start, end) {
      return end.getUTCFullYear() - start.getUTCFullYear();
    }, function(date) {
      return date.getUTCFullYear();
    });

    // An optimized implementation for this simple case.
    utcYear$1.every = function(k) {
      return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
        date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
        date.setUTCMonth(0, 1);
        date.setUTCHours(0, 0, 0, 0);
      }, function(date, step) {
        date.setUTCFullYear(date.getUTCFullYear() + step * k);
      });
    };

    function localDate(d) {
      if (0 <= d.y && d.y < 100) {
        var date = new Date(-1, d.m, d.d, d.H, d.M, d.S, d.L);
        date.setFullYear(d.y);
        return date;
      }
      return new Date(d.y, d.m, d.d, d.H, d.M, d.S, d.L);
    }

    function utcDate(d) {
      if (0 <= d.y && d.y < 100) {
        var date = new Date(Date.UTC(-1, d.m, d.d, d.H, d.M, d.S, d.L));
        date.setUTCFullYear(d.y);
        return date;
      }
      return new Date(Date.UTC(d.y, d.m, d.d, d.H, d.M, d.S, d.L));
    }

    function newDate(y, m, d) {
      return {y: y, m: m, d: d, H: 0, M: 0, S: 0, L: 0};
    }

    function formatLocale$1(locale) {
      var locale_dateTime = locale.dateTime,
          locale_date = locale.date,
          locale_time = locale.time,
          locale_periods = locale.periods,
          locale_weekdays = locale.days,
          locale_shortWeekdays = locale.shortDays,
          locale_months = locale.months,
          locale_shortMonths = locale.shortMonths;

      var periodRe = formatRe(locale_periods),
          periodLookup = formatLookup(locale_periods),
          weekdayRe = formatRe(locale_weekdays),
          weekdayLookup = formatLookup(locale_weekdays),
          shortWeekdayRe = formatRe(locale_shortWeekdays),
          shortWeekdayLookup = formatLookup(locale_shortWeekdays),
          monthRe = formatRe(locale_months),
          monthLookup = formatLookup(locale_months),
          shortMonthRe = formatRe(locale_shortMonths),
          shortMonthLookup = formatLookup(locale_shortMonths);

      var formats = {
        "a": formatShortWeekday,
        "A": formatWeekday,
        "b": formatShortMonth,
        "B": formatMonth,
        "c": null,
        "d": formatDayOfMonth,
        "e": formatDayOfMonth,
        "f": formatMicroseconds,
        "g": formatYearISO,
        "G": formatFullYearISO,
        "H": formatHour24,
        "I": formatHour12,
        "j": formatDayOfYear,
        "L": formatMilliseconds,
        "m": formatMonthNumber,
        "M": formatMinutes,
        "p": formatPeriod,
        "q": formatQuarter,
        "Q": formatUnixTimestamp,
        "s": formatUnixTimestampSeconds,
        "S": formatSeconds,
        "u": formatWeekdayNumberMonday,
        "U": formatWeekNumberSunday,
        "V": formatWeekNumberISO,
        "w": formatWeekdayNumberSunday,
        "W": formatWeekNumberMonday,
        "x": null,
        "X": null,
        "y": formatYear,
        "Y": formatFullYear,
        "Z": formatZone,
        "%": formatLiteralPercent
      };

      var utcFormats = {
        "a": formatUTCShortWeekday,
        "A": formatUTCWeekday,
        "b": formatUTCShortMonth,
        "B": formatUTCMonth,
        "c": null,
        "d": formatUTCDayOfMonth,
        "e": formatUTCDayOfMonth,
        "f": formatUTCMicroseconds,
        "g": formatUTCYearISO,
        "G": formatUTCFullYearISO,
        "H": formatUTCHour24,
        "I": formatUTCHour12,
        "j": formatUTCDayOfYear,
        "L": formatUTCMilliseconds,
        "m": formatUTCMonthNumber,
        "M": formatUTCMinutes,
        "p": formatUTCPeriod,
        "q": formatUTCQuarter,
        "Q": formatUnixTimestamp,
        "s": formatUnixTimestampSeconds,
        "S": formatUTCSeconds,
        "u": formatUTCWeekdayNumberMonday,
        "U": formatUTCWeekNumberSunday,
        "V": formatUTCWeekNumberISO,
        "w": formatUTCWeekdayNumberSunday,
        "W": formatUTCWeekNumberMonday,
        "x": null,
        "X": null,
        "y": formatUTCYear,
        "Y": formatUTCFullYear,
        "Z": formatUTCZone,
        "%": formatLiteralPercent
      };

      var parses = {
        "a": parseShortWeekday,
        "A": parseWeekday,
        "b": parseShortMonth,
        "B": parseMonth,
        "c": parseLocaleDateTime,
        "d": parseDayOfMonth,
        "e": parseDayOfMonth,
        "f": parseMicroseconds,
        "g": parseYear,
        "G": parseFullYear,
        "H": parseHour24,
        "I": parseHour24,
        "j": parseDayOfYear,
        "L": parseMilliseconds,
        "m": parseMonthNumber,
        "M": parseMinutes,
        "p": parsePeriod,
        "q": parseQuarter,
        "Q": parseUnixTimestamp,
        "s": parseUnixTimestampSeconds,
        "S": parseSeconds,
        "u": parseWeekdayNumberMonday,
        "U": parseWeekNumberSunday,
        "V": parseWeekNumberISO,
        "w": parseWeekdayNumberSunday,
        "W": parseWeekNumberMonday,
        "x": parseLocaleDate,
        "X": parseLocaleTime,
        "y": parseYear,
        "Y": parseFullYear,
        "Z": parseZone,
        "%": parseLiteralPercent
      };

      // These recursive directive definitions must be deferred.
      formats.x = newFormat(locale_date, formats);
      formats.X = newFormat(locale_time, formats);
      formats.c = newFormat(locale_dateTime, formats);
      utcFormats.x = newFormat(locale_date, utcFormats);
      utcFormats.X = newFormat(locale_time, utcFormats);
      utcFormats.c = newFormat(locale_dateTime, utcFormats);

      function newFormat(specifier, formats) {
        return function(date) {
          var string = [],
              i = -1,
              j = 0,
              n = specifier.length,
              c,
              pad,
              format;

          if (!(date instanceof Date)) date = new Date(+date);

          while (++i < n) {
            if (specifier.charCodeAt(i) === 37) {
              string.push(specifier.slice(j, i));
              if ((pad = pads[c = specifier.charAt(++i)]) != null) c = specifier.charAt(++i);
              else pad = c === "e" ? " " : "0";
              if (format = formats[c]) c = format(date, pad);
              string.push(c);
              j = i + 1;
            }
          }

          string.push(specifier.slice(j, i));
          return string.join("");
        };
      }

      function newParse(specifier, Z) {
        return function(string) {
          var d = newDate(1900, undefined, 1),
              i = parseSpecifier(d, specifier, string += "", 0),
              week, day$1;
          if (i != string.length) return null;

          // If a UNIX timestamp is specified, return it.
          if ("Q" in d) return new Date(d.Q);
          if ("s" in d) return new Date(d.s * 1000 + ("L" in d ? d.L : 0));

          // If this is utcParse, never use the local timezone.
          if (Z && !("Z" in d)) d.Z = 0;

          // The am-pm flag is 0 for AM, and 1 for PM.
          if ("p" in d) d.H = d.H % 12 + d.p * 12;

          // If the month was not specified, inherit from the quarter.
          if (d.m === undefined) d.m = "q" in d ? d.q : 0;

          // Convert day-of-week and week-of-year to day-of-year.
          if ("V" in d) {
            if (d.V < 1 || d.V > 53) return null;
            if (!("w" in d)) d.w = 1;
            if ("Z" in d) {
              week = utcDate(newDate(d.y, 0, 1)), day$1 = week.getUTCDay();
              week = day$1 > 4 || day$1 === 0 ? utcMonday$1.ceil(week) : utcMonday$1(week);
              week = utcDay$1.offset(week, (d.V - 1) * 7);
              d.y = week.getUTCFullYear();
              d.m = week.getUTCMonth();
              d.d = week.getUTCDate() + (d.w + 6) % 7;
            } else {
              week = localDate(newDate(d.y, 0, 1)), day$1 = week.getDay();
              week = day$1 > 4 || day$1 === 0 ? monday.ceil(week) : monday(week);
              week = day.offset(week, (d.V - 1) * 7);
              d.y = week.getFullYear();
              d.m = week.getMonth();
              d.d = week.getDate() + (d.w + 6) % 7;
            }
          } else if ("W" in d || "U" in d) {
            if (!("w" in d)) d.w = "u" in d ? d.u % 7 : "W" in d ? 1 : 0;
            day$1 = "Z" in d ? utcDate(newDate(d.y, 0, 1)).getUTCDay() : localDate(newDate(d.y, 0, 1)).getDay();
            d.m = 0;
            d.d = "W" in d ? (d.w + 6) % 7 + d.W * 7 - (day$1 + 5) % 7 : d.w + d.U * 7 - (day$1 + 6) % 7;
          }

          // If a time zone is specified, all fields are interpreted as UTC and then
          // offset according to the specified time zone.
          if ("Z" in d) {
            d.H += d.Z / 100 | 0;
            d.M += d.Z % 100;
            return utcDate(d);
          }

          // Otherwise, all fields are in local time.
          return localDate(d);
        };
      }

      function parseSpecifier(d, specifier, string, j) {
        var i = 0,
            n = specifier.length,
            m = string.length,
            c,
            parse;

        while (i < n) {
          if (j >= m) return -1;
          c = specifier.charCodeAt(i++);
          if (c === 37) {
            c = specifier.charAt(i++);
            parse = parses[c in pads ? specifier.charAt(i++) : c];
            if (!parse || ((j = parse(d, string, j)) < 0)) return -1;
          } else if (c != string.charCodeAt(j++)) {
            return -1;
          }
        }

        return j;
      }

      function parsePeriod(d, string, i) {
        var n = periodRe.exec(string.slice(i));
        return n ? (d.p = periodLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
      }

      function parseShortWeekday(d, string, i) {
        var n = shortWeekdayRe.exec(string.slice(i));
        return n ? (d.w = shortWeekdayLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
      }

      function parseWeekday(d, string, i) {
        var n = weekdayRe.exec(string.slice(i));
        return n ? (d.w = weekdayLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
      }

      function parseShortMonth(d, string, i) {
        var n = shortMonthRe.exec(string.slice(i));
        return n ? (d.m = shortMonthLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
      }

      function parseMonth(d, string, i) {
        var n = monthRe.exec(string.slice(i));
        return n ? (d.m = monthLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
      }

      function parseLocaleDateTime(d, string, i) {
        return parseSpecifier(d, locale_dateTime, string, i);
      }

      function parseLocaleDate(d, string, i) {
        return parseSpecifier(d, locale_date, string, i);
      }

      function parseLocaleTime(d, string, i) {
        return parseSpecifier(d, locale_time, string, i);
      }

      function formatShortWeekday(d) {
        return locale_shortWeekdays[d.getDay()];
      }

      function formatWeekday(d) {
        return locale_weekdays[d.getDay()];
      }

      function formatShortMonth(d) {
        return locale_shortMonths[d.getMonth()];
      }

      function formatMonth(d) {
        return locale_months[d.getMonth()];
      }

      function formatPeriod(d) {
        return locale_periods[+(d.getHours() >= 12)];
      }

      function formatQuarter(d) {
        return 1 + ~~(d.getMonth() / 3);
      }

      function formatUTCShortWeekday(d) {
        return locale_shortWeekdays[d.getUTCDay()];
      }

      function formatUTCWeekday(d) {
        return locale_weekdays[d.getUTCDay()];
      }

      function formatUTCShortMonth(d) {
        return locale_shortMonths[d.getUTCMonth()];
      }

      function formatUTCMonth(d) {
        return locale_months[d.getUTCMonth()];
      }

      function formatUTCPeriod(d) {
        return locale_periods[+(d.getUTCHours() >= 12)];
      }

      function formatUTCQuarter(d) {
        return 1 + ~~(d.getUTCMonth() / 3);
      }

      return {
        format: function(specifier) {
          var f = newFormat(specifier += "", formats);
          f.toString = function() { return specifier; };
          return f;
        },
        parse: function(specifier) {
          var p = newParse(specifier += "", false);
          p.toString = function() { return specifier; };
          return p;
        },
        utcFormat: function(specifier) {
          var f = newFormat(specifier += "", utcFormats);
          f.toString = function() { return specifier; };
          return f;
        },
        utcParse: function(specifier) {
          var p = newParse(specifier += "", true);
          p.toString = function() { return specifier; };
          return p;
        }
      };
    }

    var pads = {"-": "", "_": " ", "0": "0"},
        numberRe = /^\s*\d+/, // note: ignores next directive
        percentRe = /^%/,
        requoteRe = /[\\^$*+?|[\]().{}]/g;

    function pad(value, fill, width) {
      var sign = value < 0 ? "-" : "",
          string = (sign ? -value : value) + "",
          length = string.length;
      return sign + (length < width ? new Array(width - length + 1).join(fill) + string : string);
    }

    function requote(s) {
      return s.replace(requoteRe, "\\$&");
    }

    function formatRe(names) {
      return new RegExp("^(?:" + names.map(requote).join("|") + ")", "i");
    }

    function formatLookup(names) {
      return new Map(names.map((name, i) => [name.toLowerCase(), i]));
    }

    function parseWeekdayNumberSunday(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 1));
      return n ? (d.w = +n[0], i + n[0].length) : -1;
    }

    function parseWeekdayNumberMonday(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 1));
      return n ? (d.u = +n[0], i + n[0].length) : -1;
    }

    function parseWeekNumberSunday(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.U = +n[0], i + n[0].length) : -1;
    }

    function parseWeekNumberISO(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.V = +n[0], i + n[0].length) : -1;
    }

    function parseWeekNumberMonday(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.W = +n[0], i + n[0].length) : -1;
    }

    function parseFullYear(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 4));
      return n ? (d.y = +n[0], i + n[0].length) : -1;
    }

    function parseYear(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.y = +n[0] + (+n[0] > 68 ? 1900 : 2000), i + n[0].length) : -1;
    }

    function parseZone(d, string, i) {
      var n = /^(Z)|([+-]\d\d)(?::?(\d\d))?/.exec(string.slice(i, i + 6));
      return n ? (d.Z = n[1] ? 0 : -(n[2] + (n[3] || "00")), i + n[0].length) : -1;
    }

    function parseQuarter(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 1));
      return n ? (d.q = n[0] * 3 - 3, i + n[0].length) : -1;
    }

    function parseMonthNumber(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.m = n[0] - 1, i + n[0].length) : -1;
    }

    function parseDayOfMonth(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.d = +n[0], i + n[0].length) : -1;
    }

    function parseDayOfYear(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 3));
      return n ? (d.m = 0, d.d = +n[0], i + n[0].length) : -1;
    }

    function parseHour24(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.H = +n[0], i + n[0].length) : -1;
    }

    function parseMinutes(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.M = +n[0], i + n[0].length) : -1;
    }

    function parseSeconds(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 2));
      return n ? (d.S = +n[0], i + n[0].length) : -1;
    }

    function parseMilliseconds(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 3));
      return n ? (d.L = +n[0], i + n[0].length) : -1;
    }

    function parseMicroseconds(d, string, i) {
      var n = numberRe.exec(string.slice(i, i + 6));
      return n ? (d.L = Math.floor(n[0] / 1000), i + n[0].length) : -1;
    }

    function parseLiteralPercent(d, string, i) {
      var n = percentRe.exec(string.slice(i, i + 1));
      return n ? i + n[0].length : -1;
    }

    function parseUnixTimestamp(d, string, i) {
      var n = numberRe.exec(string.slice(i));
      return n ? (d.Q = +n[0], i + n[0].length) : -1;
    }

    function parseUnixTimestampSeconds(d, string, i) {
      var n = numberRe.exec(string.slice(i));
      return n ? (d.s = +n[0], i + n[0].length) : -1;
    }

    function formatDayOfMonth(d, p) {
      return pad(d.getDate(), p, 2);
    }

    function formatHour24(d, p) {
      return pad(d.getHours(), p, 2);
    }

    function formatHour12(d, p) {
      return pad(d.getHours() % 12 || 12, p, 2);
    }

    function formatDayOfYear(d, p) {
      return pad(1 + day.count(year(d), d), p, 3);
    }

    function formatMilliseconds(d, p) {
      return pad(d.getMilliseconds(), p, 3);
    }

    function formatMicroseconds(d, p) {
      return formatMilliseconds(d, p) + "000";
    }

    function formatMonthNumber(d, p) {
      return pad(d.getMonth() + 1, p, 2);
    }

    function formatMinutes(d, p) {
      return pad(d.getMinutes(), p, 2);
    }

    function formatSeconds(d, p) {
      return pad(d.getSeconds(), p, 2);
    }

    function formatWeekdayNumberMonday(d) {
      var day = d.getDay();
      return day === 0 ? 7 : day;
    }

    function formatWeekNumberSunday(d, p) {
      return pad(sunday.count(year(d) - 1, d), p, 2);
    }

    function dISO(d) {
      var day = d.getDay();
      return (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
    }

    function formatWeekNumberISO(d, p) {
      d = dISO(d);
      return pad(thursday.count(year(d), d) + (year(d).getDay() === 4), p, 2);
    }

    function formatWeekdayNumberSunday(d) {
      return d.getDay();
    }

    function formatWeekNumberMonday(d, p) {
      return pad(monday.count(year(d) - 1, d), p, 2);
    }

    function formatYear(d, p) {
      return pad(d.getFullYear() % 100, p, 2);
    }

    function formatYearISO(d, p) {
      d = dISO(d);
      return pad(d.getFullYear() % 100, p, 2);
    }

    function formatFullYear(d, p) {
      return pad(d.getFullYear() % 10000, p, 4);
    }

    function formatFullYearISO(d, p) {
      var day = d.getDay();
      d = (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
      return pad(d.getFullYear() % 10000, p, 4);
    }

    function formatZone(d) {
      var z = d.getTimezoneOffset();
      return (z > 0 ? "-" : (z *= -1, "+"))
          + pad(z / 60 | 0, "0", 2)
          + pad(z % 60, "0", 2);
    }

    function formatUTCDayOfMonth(d, p) {
      return pad(d.getUTCDate(), p, 2);
    }

    function formatUTCHour24(d, p) {
      return pad(d.getUTCHours(), p, 2);
    }

    function formatUTCHour12(d, p) {
      return pad(d.getUTCHours() % 12 || 12, p, 2);
    }

    function formatUTCDayOfYear(d, p) {
      return pad(1 + utcDay$1.count(utcYear$1(d), d), p, 3);
    }

    function formatUTCMilliseconds(d, p) {
      return pad(d.getUTCMilliseconds(), p, 3);
    }

    function formatUTCMicroseconds(d, p) {
      return formatUTCMilliseconds(d, p) + "000";
    }

    function formatUTCMonthNumber(d, p) {
      return pad(d.getUTCMonth() + 1, p, 2);
    }

    function formatUTCMinutes(d, p) {
      return pad(d.getUTCMinutes(), p, 2);
    }

    function formatUTCSeconds(d, p) {
      return pad(d.getUTCSeconds(), p, 2);
    }

    function formatUTCWeekdayNumberMonday(d) {
      var dow = d.getUTCDay();
      return dow === 0 ? 7 : dow;
    }

    function formatUTCWeekNumberSunday(d, p) {
      return pad(utcSunday$1.count(utcYear$1(d) - 1, d), p, 2);
    }

    function UTCdISO(d) {
      var day = d.getUTCDay();
      return (day >= 4 || day === 0) ? utcThursday$1(d) : utcThursday$1.ceil(d);
    }

    function formatUTCWeekNumberISO(d, p) {
      d = UTCdISO(d);
      return pad(utcThursday$1.count(utcYear$1(d), d) + (utcYear$1(d).getUTCDay() === 4), p, 2);
    }

    function formatUTCWeekdayNumberSunday(d) {
      return d.getUTCDay();
    }

    function formatUTCWeekNumberMonday(d, p) {
      return pad(utcMonday$1.count(utcYear$1(d) - 1, d), p, 2);
    }

    function formatUTCYear(d, p) {
      return pad(d.getUTCFullYear() % 100, p, 2);
    }

    function formatUTCYearISO(d, p) {
      d = UTCdISO(d);
      return pad(d.getUTCFullYear() % 100, p, 2);
    }

    function formatUTCFullYear(d, p) {
      return pad(d.getUTCFullYear() % 10000, p, 4);
    }

    function formatUTCFullYearISO(d, p) {
      var day = d.getUTCDay();
      d = (day >= 4 || day === 0) ? utcThursday$1(d) : utcThursday$1.ceil(d);
      return pad(d.getUTCFullYear() % 10000, p, 4);
    }

    function formatUTCZone() {
      return "+0000";
    }

    function formatLiteralPercent() {
      return "%";
    }

    function formatUnixTimestamp(d) {
      return +d;
    }

    function formatUnixTimestampSeconds(d) {
      return Math.floor(+d / 1000);
    }

    var locale$1;
    var timeFormat;
    var timeParse;
    var utcFormat;
    var utcParse;

    defaultLocale$1({
      dateTime: "%x, %X",
      date: "%-m/%-d/%Y",
      time: "%-I:%M:%S %p",
      periods: ["AM", "PM"],
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    });

    function defaultLocale$1(definition) {
      locale$1 = formatLocale$1(definition);
      timeFormat = locale$1.format;
      timeParse = locale$1.parse;
      utcFormat = locale$1.utcFormat;
      utcParse = locale$1.utcParse;
      return locale$1;
    }

    function date$1(t) {
      return new Date(t);
    }

    function number$1(t) {
      return t instanceof Date ? +t : +new Date(+t);
    }

    function calendar(ticks, tickInterval, year, month, week, day, hour, minute, second, format) {
      var scale = continuous(),
          invert = scale.invert,
          domain = scale.domain;

      var formatMillisecond = format(".%L"),
          formatSecond = format(":%S"),
          formatMinute = format("%I:%M"),
          formatHour = format("%I %p"),
          formatDay = format("%a %d"),
          formatWeek = format("%b %d"),
          formatMonth = format("%B"),
          formatYear = format("%Y");

      function tickFormat(date) {
        return (second(date) < date ? formatMillisecond
            : minute(date) < date ? formatSecond
            : hour(date) < date ? formatMinute
            : day(date) < date ? formatHour
            : month(date) < date ? (week(date) < date ? formatDay : formatWeek)
            : year(date) < date ? formatMonth
            : formatYear)(date);
      }

      scale.invert = function(y) {
        return new Date(invert(y));
      };

      scale.domain = function(_) {
        return arguments.length ? domain(Array.from(_, number$1)) : domain().map(date$1);
      };

      scale.ticks = function(interval) {
        var d = domain();
        return ticks(d[0], d[d.length - 1], interval == null ? 10 : interval);
      };

      scale.tickFormat = function(count, specifier) {
        return specifier == null ? tickFormat : format(specifier);
      };

      scale.nice = function(interval) {
        var d = domain();
        if (!interval || typeof interval.range !== "function") interval = tickInterval(d[0], d[d.length - 1], interval == null ? 10 : interval);
        return interval ? domain(nice(d, interval)) : scale;
      };

      scale.copy = function() {
        return copy(scale, calendar(ticks, tickInterval, year, month, week, day, hour, minute, second, format));
      };

      return scale;
    }

    function time() {
      return initRange.apply(calendar(timeTicks, timeTickInterval, timeYear, timeMonth, timeSunday, timeDay, timeHour, timeMinute, second, timeFormat).domain([new Date(2000, 0, 1), new Date(2000, 0, 2)]), arguments);
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector(f) {
      let delta = f;
      let compare = f;

      if (f.length === 1) {
        delta = (d, x) => f(d) - x;
        compare = ascendingComparator(f);
      }

      function left(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (compare(a[mid], x) < 0) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      }

      function right(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (compare(a[mid], x) > 0) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      }

      function center(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        const i = left(a, x, lo, hi - 1);
        return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
      }

      return {left, center, right};
    }

    function ascendingComparator(f) {
      return (d, x) => ascending(f(d), x);
    }

    function extent(values, valueof) {
      let min;
      let max;
      if (valueof === undefined) {
        for (const value of values) {
          if (value != null) {
            if (min === undefined) {
              if (value >= value) min = max = value;
            } else {
              if (min > value) min = value;
              if (max < value) max = value;
            }
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null) {
            if (min === undefined) {
              if (value >= value) min = max = value;
            } else {
              if (min > value) min = value;
              if (max < value) max = value;
            }
          }
        }
      }
      return [min, max];
    }

    function max(values, valueof) {
      let max;
      if (valueof === undefined) {
        for (const value of values) {
          if (value != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      }
      return max;
    }

    /* src\components\charts\Line.svelte generated by Svelte v3.31.0 */
    const file$2 = "src\\components\\charts\\Line.svelte";

    // (48:0) {#if width}
    function create_if_block$2(ctx) {
    	let svg;
    	let title_1;
    	let t0;
    	let desc_1;
    	let t1;
    	let g;
    	let path_1;
    	let path_1_d_value;
    	let axis0;
    	let axis1;
    	let pointinteractive;
    	let svg_viewBox_value;
    	let current;
    	let mounted;
    	let dispose;

    	axis0 = new Axis({
    			props: {
    				width: /*width*/ ctx[8],
    				height: /*height*/ ctx[9],
    				margin: /*margin*/ ctx[1],
    				scale: /*y*/ ctx[11],
    				position: "left",
    				format: /*format*/ ctx[2].y
    			},
    			$$inline: true
    		});

    	axis1 = new Axis({
    			props: {
    				width: /*width*/ ctx[8],
    				height: /*height*/ ctx[9],
    				margin: /*margin*/ ctx[1],
    				scale: /*x*/ ctx[10],
    				position: "bottom",
    				format: /*format*/ ctx[2].x
    			},
    			$$inline: true
    		});

    	pointinteractive = new PointInteractive({
    			props: {
    				datum: /*datum*/ ctx[12],
    				format: /*format*/ ctx[2],
    				x: /*x*/ ctx[10],
    				y: /*y*/ ctx[11],
    				key: /*key*/ ctx[3],
    				width: /*width*/ ctx[8]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			title_1 = svg_element("title");
    			t0 = text(/*title*/ ctx[5]);
    			desc_1 = svg_element("desc");
    			t1 = text(/*desc*/ ctx[6]);
    			g = svg_element("g");
    			path_1 = svg_element("path");
    			create_component(axis0.$$.fragment);
    			create_component(axis1.$$.fragment);
    			create_component(pointinteractive.$$.fragment);
    			attr_dev(title_1, "id", "title");
    			add_location(title_1, file$2, 59, 1, 1549);
    			attr_dev(desc_1, "id", "desc");
    			add_location(desc_1, file$2, 60, 1, 1585);
    			attr_dev(path_1, "d", path_1_d_value = /*path*/ ctx[13](/*data*/ ctx[0]));
    			attr_dev(path_1, "stroke", /*color*/ ctx[4]);
    			attr_dev(path_1, "fill", "none");
    			add_location(path_1, file$2, 62, 2, 1624);
    			add_location(g, file$2, 61, 1, 1617);
    			attr_dev(svg, "xmlns:svg", "https://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + /*width*/ ctx[8] + " " + /*height*/ ctx[9]);
    			attr_dev(svg, "width", /*width*/ ctx[8]);
    			attr_dev(svg, "height", /*height*/ ctx[9]);
    			attr_dev(svg, "role", "img");
    			attr_dev(svg, "aria-labelledby", "title desc");
    			add_location(svg, file$2, 48, 0, 1279);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, title_1);
    			append_dev(title_1, t0);
    			append_dev(svg, desc_1);
    			append_dev(desc_1, t1);
    			append_dev(svg, g);
    			append_dev(g, path_1);
    			mount_component(axis0, svg, null);
    			mount_component(axis1, svg, null);
    			mount_component(pointinteractive, svg, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(svg, "touchmove", prevent_default(/*touchmove_handler*/ ctx[16]), false, true, false),
    					listen_dev(svg, "pointermove", prevent_default(/*mouseMove*/ ctx[14]), false, true, false),
    					listen_dev(svg, "mouseleave", /*leave*/ ctx[15], false, false, false),
    					listen_dev(svg, "touchend", /*leave*/ ctx[15], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*title*/ 32) set_data_dev(t0, /*title*/ ctx[5]);
    			if (!current || dirty & /*desc*/ 64) set_data_dev(t1, /*desc*/ ctx[6]);

    			if (!current || dirty & /*path, data*/ 8193 && path_1_d_value !== (path_1_d_value = /*path*/ ctx[13](/*data*/ ctx[0]))) {
    				attr_dev(path_1, "d", path_1_d_value);
    			}

    			if (!current || dirty & /*color*/ 16) {
    				attr_dev(path_1, "stroke", /*color*/ ctx[4]);
    			}

    			const axis0_changes = {};
    			if (dirty & /*width*/ 256) axis0_changes.width = /*width*/ ctx[8];
    			if (dirty & /*height*/ 512) axis0_changes.height = /*height*/ ctx[9];
    			if (dirty & /*margin*/ 2) axis0_changes.margin = /*margin*/ ctx[1];
    			if (dirty & /*y*/ 2048) axis0_changes.scale = /*y*/ ctx[11];
    			if (dirty & /*format*/ 4) axis0_changes.format = /*format*/ ctx[2].y;
    			axis0.$set(axis0_changes);
    			const axis1_changes = {};
    			if (dirty & /*width*/ 256) axis1_changes.width = /*width*/ ctx[8];
    			if (dirty & /*height*/ 512) axis1_changes.height = /*height*/ ctx[9];
    			if (dirty & /*margin*/ 2) axis1_changes.margin = /*margin*/ ctx[1];
    			if (dirty & /*x*/ 1024) axis1_changes.scale = /*x*/ ctx[10];
    			if (dirty & /*format*/ 4) axis1_changes.format = /*format*/ ctx[2].x;
    			axis1.$set(axis1_changes);
    			const pointinteractive_changes = {};
    			if (dirty & /*datum*/ 4096) pointinteractive_changes.datum = /*datum*/ ctx[12];
    			if (dirty & /*format*/ 4) pointinteractive_changes.format = /*format*/ ctx[2];
    			if (dirty & /*x*/ 1024) pointinteractive_changes.x = /*x*/ ctx[10];
    			if (dirty & /*y*/ 2048) pointinteractive_changes.y = /*y*/ ctx[11];
    			if (dirty & /*key*/ 8) pointinteractive_changes.key = /*key*/ ctx[3];
    			if (dirty & /*width*/ 256) pointinteractive_changes.width = /*width*/ ctx[8];
    			pointinteractive.$set(pointinteractive_changes);

    			if (!current || dirty & /*width, height*/ 768 && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + /*width*/ ctx[8] + " " + /*height*/ ctx[9])) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}

    			if (!current || dirty & /*width*/ 256) {
    				attr_dev(svg, "width", /*width*/ ctx[8]);
    			}

    			if (!current || dirty & /*height*/ 512) {
    				attr_dev(svg, "height", /*height*/ ctx[9]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(axis0.$$.fragment, local);
    			transition_in(axis1.$$.fragment, local);
    			transition_in(pointinteractive.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(axis0.$$.fragment, local);
    			transition_out(axis1.$$.fragment, local);
    			transition_out(pointinteractive.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			destroy_component(axis0);
    			destroy_component(axis1);
    			destroy_component(pointinteractive);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(48:0) {#if width}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div;
    	let div_class_value;
    	let div_resize_listener;
    	let current;
    	let if_block = /*width*/ ctx[8] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div, "class", div_class_value = "graphic " + /*layout*/ ctx[7]);
    			add_render_callback(() => /*div_elementresize_handler*/ ctx[17].call(div));
    			add_location(div, file$2, 46, 0, 1182);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			div_resize_listener = add_resize_listener(div, /*div_elementresize_handler*/ ctx[17].bind(div));
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*width*/ ctx[8]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*width*/ 256) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*layout*/ 128 && div_class_value !== (div_class_value = "graphic " + /*layout*/ ctx[7])) {
    				attr_dev(div, "class", div_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			div_resize_listener();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Line", slots, []);
    	let { data } = $$props;
    	let { margin = { top: 20, right: 5, bottom: 20, left: 5 } } = $$props;
    	let { format } = $$props;
    	let { key } = $$props;
    	let { color } = $$props;
    	let { title } = $$props;
    	let { desc } = $$props;
    	let { layout } = $$props;
    	let datum, width, height;

    	const mouseMove = m => {
    		const mX = m.offsetX ? m.offsetX : m.clientX;
    		const _data = [...data];
    		_data.sort((a, b) => a[key.x] - b[[key.x]]);
    		const index = x.invert(mX);
    		const i = bisector(d => d[key.x]).center(_data, index);
    		$$invalidate(12, datum = _data[i]);
    	};

    	const leave = m => {
    		$$invalidate(12, datum = undefined);
    	};

    	const writable_props = ["data", "margin", "format", "key", "color", "title", "desc", "layout"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Line> was created with unknown prop '${key}'`);
    	});

    	function touchmove_handler(event) {
    		bubble($$self, event);
    	}

    	function div_elementresize_handler() {
    		width = this.clientWidth;
    		height = this.clientHeight;
    		$$invalidate(8, width);
    		$$invalidate(9, height);
    	}

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("margin" in $$props) $$invalidate(1, margin = $$props.margin);
    		if ("format" in $$props) $$invalidate(2, format = $$props.format);
    		if ("key" in $$props) $$invalidate(3, key = $$props.key);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("title" in $$props) $$invalidate(5, title = $$props.title);
    		if ("desc" in $$props) $$invalidate(6, desc = $$props.desc);
    		if ("layout" in $$props) $$invalidate(7, layout = $$props.layout);
    	};

    	$$self.$capture_state = () => ({
    		Axis,
    		PointInteractive,
    		line,
    		curveStep,
    		scaleTime: time,
    		scaleLinear: linear$1,
    		max,
    		extent,
    		bisector,
    		data,
    		margin,
    		format,
    		key,
    		color,
    		title,
    		desc,
    		layout,
    		datum,
    		width,
    		height,
    		mouseMove,
    		leave,
    		x,
    		y,
    		path
    	});

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    		if ("margin" in $$props) $$invalidate(1, margin = $$props.margin);
    		if ("format" in $$props) $$invalidate(2, format = $$props.format);
    		if ("key" in $$props) $$invalidate(3, key = $$props.key);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("title" in $$props) $$invalidate(5, title = $$props.title);
    		if ("desc" in $$props) $$invalidate(6, desc = $$props.desc);
    		if ("layout" in $$props) $$invalidate(7, layout = $$props.layout);
    		if ("datum" in $$props) $$invalidate(12, datum = $$props.datum);
    		if ("width" in $$props) $$invalidate(8, width = $$props.width);
    		if ("height" in $$props) $$invalidate(9, height = $$props.height);
    		if ("x" in $$props) $$invalidate(10, x = $$props.x);
    		if ("y" in $$props) $$invalidate(11, y = $$props.y);
    		if ("path" in $$props) $$invalidate(13, path = $$props.path);
    	};

    	let x;
    	let y;
    	let path;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data, key, margin, width*/ 267) {
    			 $$invalidate(10, x = time().domain(extent(data, d => d[key.x])).range([margin.left, width - margin.right]));
    		}

    		if ($$self.$$.dirty & /*data, key, height, margin*/ 523) {
    			 $$invalidate(11, y = linear$1().domain([0, max(data, d => d[key.y])]).range([height - margin.bottom - margin.top, margin.top]));
    		}

    		if ($$self.$$.dirty & /*x, key, y*/ 3080) {
    			 $$invalidate(13, path = line().x(d => x(d[key.x])).y(d => y(d[key.y])).curve(curveStep));
    		}
    	};

    	return [
    		data,
    		margin,
    		format,
    		key,
    		color,
    		title,
    		desc,
    		layout,
    		width,
    		height,
    		x,
    		y,
    		datum,
    		path,
    		mouseMove,
    		leave,
    		touchmove_handler,
    		div_elementresize_handler
    	];
    }

    class Line extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			data: 0,
    			margin: 1,
    			format: 2,
    			key: 3,
    			color: 4,
    			title: 5,
    			desc: 6,
    			layout: 7
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Line",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*data*/ ctx[0] === undefined && !("data" in props)) {
    			console.warn("<Line> was created without expected prop 'data'");
    		}

    		if (/*format*/ ctx[2] === undefined && !("format" in props)) {
    			console.warn("<Line> was created without expected prop 'format'");
    		}

    		if (/*key*/ ctx[3] === undefined && !("key" in props)) {
    			console.warn("<Line> was created without expected prop 'key'");
    		}

    		if (/*color*/ ctx[4] === undefined && !("color" in props)) {
    			console.warn("<Line> was created without expected prop 'color'");
    		}

    		if (/*title*/ ctx[5] === undefined && !("title" in props)) {
    			console.warn("<Line> was created without expected prop 'title'");
    		}

    		if (/*desc*/ ctx[6] === undefined && !("desc" in props)) {
    			console.warn("<Line> was created without expected prop 'desc'");
    		}

    		if (/*layout*/ ctx[7] === undefined && !("layout" in props)) {
    			console.warn("<Line> was created without expected prop 'layout'");
    		}
    	}

    	get data() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get margin() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set margin(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get format() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set format(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get key() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set key(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get desc() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set desc(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get layout() {
    		throw new Error("<Line>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set layout(value) {
    		throw new Error("<Line>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var ffRenData = [
    	{
    		year: 1900,
    		coalprod: "1.92322e+4",
    		coalprodpercap: "1.91858e+3",
    		gasprod: "2.21520e+2",
    		oilprodpercap: "9.82316e+0",
    		oilprod: "7.10839e+2",
    		gasprodpercap: "2.37052e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1901,
    		coalprod: "1.95062e+4",
    		coalprodpercap: "1.95788e+3",
    		gasprod: "2.45484e+2",
    		oilprodpercap: "1.06790e+1",
    		oilprod: "7.95481e+2",
    		gasprodpercap: "2.58919e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1902,
    		coalprod: "1.99302e+4",
    		coalprodpercap: "1.98437e+3",
    		gasprod: "2.69448e+2",
    		oilprodpercap: "1.14968e+1",
    		oilprod: "8.64728e+2",
    		gasprodpercap: "2.87851e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1903,
    		coalprod: "2.15975e+4",
    		coalprodpercap: "2.08453e+3",
    		gasprod: "2.93409e+2",
    		oilprodpercap: "1.22778e+1",
    		oilprod: "9.25225e+2",
    		gasprodpercap: "3.37033e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1904,
    		coalprod: "2.17291e+4",
    		coalprodpercap: "2.07070e+3",
    		gasprod: "3.17373e+2",
    		oilprodpercap: "1.30245e+1",
    		oilprod: "1.04048e+3",
    		gasprodpercap: "3.92794e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1905,
    		coalprod: "2.32777e+4",
    		coalprodpercap: "2.14388e+3",
    		gasprod: "3.41337e+2",
    		oilprodpercap: "1.37379e+1",
    		oilprod: "1.02304e+3",
    		gasprodpercap: "4.44818e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1906,
    		coalprod: "2.45962e+4",
    		coalprodpercap: "2.26958e+3",
    		gasprod: "3.65298e+2",
    		oilprodpercap: "1.44190e+1",
    		oilprod: "1.01895e+3",
    		gasprodpercap: "4.60790e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1907,
    		coalprod: "2.70513e+4",
    		coalprodpercap: "2.41327e+3",
    		gasprod: "3.89262e+2",
    		oilprodpercap: "1.50688e+1",
    		oilprod: "1.26227e+3",
    		gasprodpercap: "5.92287e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1908,
    		coalprod: "2.59229e+4",
    		coalprodpercap: "2.36721e+3",
    		gasprod: "4.13226e+2",
    		oilprodpercap: "1.56882e+1",
    		oilprod: "1.37056e+3",
    		gasprodpercap: "6.70686e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1909,
    		coalprod: "2.69334e+4",
    		coalprodpercap: "2.36341e+3",
    		gasprod: "4.37187e+2",
    		oilprodpercap: "1.62955e+1",
    		oilprod: "1.44296e+3",
    		gasprodpercap: "7.16801e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1910,
    		coalprod: "2.82075e+4",
    		coalprodpercap: "2.46524e+3",
    		gasprod: "4.72767e+2",
    		oilprodpercap: "2.24465e+1",
    		oilprod: "1.56297e+3",
    		gasprodpercap: "7.36700e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1911,
    		coalprod: "2.87852e+4",
    		coalprodpercap: "2.46584e+3",
    		gasprod: "4.97895e+2",
    		oilprodpercap: "2.30719e+1",
    		oilprod: "1.65101e+3",
    		gasprodpercap: "8.82001e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1912,
    		coalprod: "3.01230e+4",
    		coalprodpercap: "2.58876e+3",
    		gasprod: "5.23026e+2",
    		oilprodpercap: "2.36948e+1",
    		oilprod: "1.67319e+3",
    		gasprodpercap: "9.28457e+1",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1913,
    		coalprod: "3.22924e+4",
    		coalprodpercap: "2.69715e+3",
    		gasprod: "5.48154e+2",
    		oilprodpercap: "2.43186e+1",
    		oilprod: "1.84567e+3",
    		gasprodpercap: "1.07579e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1914,
    		coalprod: "2.89256e+4",
    		coalprodpercap: "2.43607e+3",
    		gasprod: "5.73282e+2",
    		oilprodpercap: "2.49187e+1",
    		oilprod: "1.89902e+3",
    		gasprodpercap: "1.04928e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1915,
    		coalprod: "2.82781e+4",
    		coalprodpercap: "2.34178e+3",
    		gasprod: "5.98413e+2",
    		oilprodpercap: "2.54958e+1",
    		oilprod: "2.03662e+3",
    		gasprodpercap: "1.19360e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1916,
    		coalprod: "3.01987e+4",
    		coalprodpercap: "2.38870e+3",
    		gasprod: "6.23541e+2",
    		oilprodpercap: "2.60503e+1",
    		oilprod: "2.18696e+3",
    		gasprodpercap: "1.26339e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1917,
    		coalprod: "3.12396e+4",
    		coalprodpercap: "2.20073e+3",
    		gasprod: "6.48670e+2",
    		oilprodpercap: "2.65830e+1",
    		oilprod: "2.41582e+3",
    		gasprodpercap: "1.52536e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1918,
    		coalprod: "3.05162e+4",
    		coalprodpercap: "2.16611e+3",
    		gasprod: "6.73800e+2",
    		oilprodpercap: "2.71038e+1",
    		oilprod: "2.39911e+3",
    		gasprodpercap: "1.67872e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1919,
    		coalprod: "2.59305e+4",
    		coalprodpercap: "1.89959e+3",
    		gasprod: "6.98928e+2",
    		oilprodpercap: "2.76051e+1",
    		oilprod: "2.73300e+3",
    		gasprodpercap: "1.99639e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1920,
    		coalprod: "2.96339e+4",
    		coalprodpercap: "2.17375e+3",
    		gasprod: "7.24057e+2",
    		oilprodpercap: "2.80857e+1",
    		oilprod: "3.49686e+3",
    		gasprodpercap: "3.04889e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1921,
    		coalprod: "2.49147e+4",
    		coalprodpercap: "1.93514e+3",
    		gasprod: "7.49187e+2",
    		oilprodpercap: "2.85503e+1",
    		oilprod: "3.78879e+3",
    		gasprodpercap: "3.46905e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1922,
    		coalprod: "2.67372e+4",
    		coalprodpercap: "2.04145e+3",
    		gasprod: "8.04034e+2",
    		oilprodpercap: "3.32919e+1",
    		oilprod: "4.23237e+3",
    		gasprodpercap: "3.58596e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1923,
    		coalprod: "3.04857e+4",
    		coalprodpercap: "2.23094e+3",
    		gasprod: "9.41491e+2",
    		oilprodpercap: "3.80870e+1",
    		oilprod: "5.00572e+3",
    		gasprodpercap: "3.53260e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1924,
    		coalprod: "3.00755e+4",
    		coalprodpercap: "2.22356e+3",
    		gasprod: "1.07895e+3",
    		oilprodpercap: "4.27378e+1",
    		oilprod: "4.99793e+3",
    		gasprodpercap: "3.49568e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1925,
    		coalprod: "3.01104e+4",
    		coalprodpercap: "2.20856e+3",
    		gasprod: "1.21640e+3",
    		oilprodpercap: "4.72472e+1",
    		oilprod: "5.24027e+3",
    		gasprodpercap: "3.37218e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1926,
    		coalprod: "2.93452e+4",
    		coalprodpercap: "2.16387e+3",
    		gasprod: "1.35386e+3",
    		oilprodpercap: "5.16186e+1",
    		oilprod: "5.37922e+3",
    		gasprodpercap: "3.36411e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1927,
    		coalprod: "3.23672e+4",
    		coalprodpercap: "2.38774e+3",
    		gasprod: "1.49132e+3",
    		oilprodpercap: "5.58549e+1",
    		oilprod: "6.13905e+3",
    		gasprodpercap: "3.48624e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1928,
    		coalprod: "3.18161e+4",
    		coalprodpercap: "2.35013e+3",
    		gasprod: "1.62877e+3",
    		oilprodpercap: "5.99590e+1",
    		oilprod: "6.44505e+3",
    		gasprodpercap: "3.65154e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1929,
    		coalprod: "3.38553e+4",
    		coalprodpercap: "2.42339e+3",
    		gasprod: "1.72690e+3",
    		oilprodpercap: "6.54251e+1",
    		oilprod: "7.21376e+3",
    		gasprodpercap: "3.84791e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1930,
    		coalprod: "3.09773e+4",
    		coalprodpercap: "2.23750e+3",
    		gasprod: "1.81112e+3",
    		oilprodpercap: "6.85530e+1",
    		oilprod: "6.88771e+3",
    		gasprodpercap: "3.63449e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1931,
    		coalprod: "2.74328e+4",
    		coalprodpercap: "1.99501e+3",
    		gasprod: "1.89701e+3",
    		oilprodpercap: "7.16914e+1",
    		oilprod: "6.66424e+3",
    		gasprodpercap: "3.56830e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1932,
    		coalprod: "2.45084e+4",
    		coalprodpercap: "1.78060e+3",
    		gasprod: "1.98290e+3",
    		oilprodpercap: "7.48362e+1",
    		oilprod: "6.36995e+3",
    		gasprodpercap: "9.56429e+2",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1933,
    		coalprod: "2.55778e+4",
    		coalprodpercap: "1.84538e+3",
    		gasprod: "2.06880e+3",
    		oilprodpercap: "7.80021e+1",
    		oilprod: "6.95688e+3",
    		gasprodpercap: "1.31886e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1934,
    		coalprod: "2.78402e+4",
    		coalprodpercap: "1.97245e+3",
    		gasprod: "2.15469e+3",
    		oilprodpercap: "8.10995e+1",
    		oilprod: "7.36045e+3",
    		gasprodpercap: "1.68096e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1935,
    		coalprod: "2.90128e+4",
    		coalprodpercap: "2.02299e+3",
    		gasprod: "2.24058e+3",
    		oilprodpercap: "8.41294e+1",
    		oilprod: "8.05551e+3",
    		gasprodpercap: "2.08843e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1936,
    		coalprod: "3.16649e+4",
    		coalprodpercap: "2.12998e+3",
    		gasprod: "2.32647e+3",
    		oilprodpercap: "8.70929e+1",
    		oilprod: "8.77755e+3",
    		gasprodpercap: "2.56093e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1937,
    		coalprod: "3.34250e+4",
    		coalprodpercap: "2.26742e+3",
    		gasprod: "2.49563e+3",
    		oilprodpercap: "3.22038e+2",
    		oilprod: "9.99320e+3",
    		gasprodpercap: "3.30947e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1938,
    		coalprod: "3.15096e+4",
    		coalprodpercap: "2.20001e+3",
    		gasprod: "2.64988e+3",
    		oilprodpercap: "1.07090e+2",
    		oilprod: "9.76213e+3",
    		gasprodpercap: "3.70406e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1939,
    		coalprod: "3.30093e+4",
    		coalprodpercap: "2.24611e+3",
    		gasprod: "2.83945e+3",
    		oilprodpercap: "1.10951e+2",
    		oilprod: "1.01548e+4",
    		gasprodpercap: "3.77664e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1940,
    		coalprod: "3.62132e+4",
    		coalprodpercap: "2.38637e+3",
    		gasprod: "3.02903e+3",
    		oilprodpercap: "1.14614e+2",
    		oilprod: "1.04342e+4",
    		gasprodpercap: "3.88566e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1941,
    		coalprod: "3.73230e+4",
    		coalprodpercap: "2.45912e+3",
    		gasprod: "3.21861e+3",
    		oilprodpercap: "1.18077e+2",
    		oilprod: "1.06966e+4",
    		gasprodpercap: "3.09795e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1942,
    		coalprod: "3.79226e+4",
    		coalprodpercap: "2.49772e+3",
    		gasprod: "3.40819e+3",
    		oilprodpercap: "1.21306e+2",
    		oilprod: "1.01367e+4",
    		gasprodpercap: "2.42000e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1943,
    		coalprod: "3.88613e+4",
    		coalprodpercap: "2.49791e+3",
    		gasprod: "3.59777e+3",
    		oilprodpercap: "1.24295e+2",
    		oilprod: "1.09285e+4",
    		gasprodpercap: "3.04244e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1944,
    		coalprod: "3.70117e+4",
    		coalprodpercap: "2.26424e+3",
    		gasprod: "3.78734e+3",
    		oilprodpercap: "1.27155e+2",
    		oilprod: "1.25798e+4",
    		gasprodpercap: "3.60472e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1945,
    		coalprod: "2.89494e+4",
    		coalprodpercap: "1.75891e+3",
    		gasprod: "3.97692e+3",
    		oilprodpercap: "1.29891e+2",
    		oilprod: "1.26233e+4",
    		gasprodpercap: "2.31459e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1946,
    		coalprod: "3.17737e+4",
    		coalprodpercap: "2.01550e+3",
    		gasprod: "4.19532e+3",
    		oilprodpercap: "2.15762e+2",
    		oilprod: "1.35248e+4",
    		gasprodpercap: "3.04018e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1947,
    		coalprod: "3.56203e+4",
    		coalprodpercap: "2.17254e+3",
    		gasprod: "4.64306e+3",
    		oilprodpercap: "2.16071e+2",
    		oilprod: "1.49460e+4",
    		gasprodpercap: "8.09318e+3",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1948,
    		coalprod: "3.70540e+4",
    		coalprodpercap: "2.30367e+3",
    		gasprod: "5.25361e+3",
    		oilprodpercap: "2.70337e+2",
    		oilprod: "1.70517e+4",
    		gasprodpercap: "1.40703e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1949,
    		coalprod: "3.58106e+4",
    		coalprodpercap: "2.30845e+3",
    		gasprod: "5.61383e+3",
    		oilprodpercap: "1.93005e+2",
    		oilprod: "1.71919e+4",
    		gasprodpercap: "2.07118e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1950,
    		coalprod: "3.88301e+4",
    		coalprodpercap: "2.41545e+3",
    		gasprod: "6.43696e+3",
    		oilprodpercap: "2.17361e+2",
    		oilprod: "1.94846e+4",
    		gasprodpercap: "3.28255e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1951,
    		coalprod: "4.09355e+4",
    		coalprodpercap: "2.51480e+3",
    		gasprod: "7.63835e+3",
    		oilprodpercap: "3.76366e+2",
    		oilprod: "2.21888e+4",
    		gasprodpercap: "4.42723e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1952,
    		coalprod: "4.08944e+4",
    		coalprodpercap: "2.54993e+3",
    		gasprod: "8.22753e+3",
    		oilprodpercap: "3.79408e+2",
    		oilprod: "2.35820e+4",
    		gasprodpercap: "5.29640e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1953,
    		coalprod: "4.11213e+4",
    		coalprodpercap: "2.53107e+3",
    		gasprod: "8.70877e+3",
    		oilprodpercap: "4.11273e+2",
    		oilprod: "2.52225e+4",
    		gasprodpercap: "5.71201e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1954,
    		coalprod: "4.06882e+4",
    		coalprodpercap: "2.51733e+3",
    		gasprod: "9.14376e+3",
    		oilprodpercap: "4.36935e+2",
    		oilprod: "2.65898e+4",
    		gasprodpercap: "6.02396e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1955,
    		coalprod: "4.38794e+4",
    		coalprodpercap: "2.62034e+3",
    		gasprod: "9.96553e+3",
    		oilprodpercap: "4.77695e+2",
    		oilprod: "2.99077e+4",
    		gasprodpercap: "6.52160e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1956,
    		coalprod: "4.61495e+4",
    		coalprodpercap: "2.64844e+3",
    		gasprod: "1.08154e+4",
    		oilprodpercap: "4.99941e+2",
    		oilprod: "3.23909e+4",
    		gasprodpercap: "6.42939e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1957,
    		coalprod: "4.73846e+4",
    		coalprodpercap: "2.65930e+3",
    		gasprod: "1.17538e+4",
    		oilprodpercap: "5.06859e+2",
    		oilprod: "3.39612e+4",
    		gasprodpercap: "6.45463e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1958,
    		coalprod: "4.86524e+4",
    		coalprodpercap: "2.66322e+3",
    		gasprod: "1.26449e+4",
    		oilprodpercap: "5.39534e+2",
    		oilprod: "3.54947e+4",
    		gasprodpercap: "7.19925e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1959,
    		coalprod: "5.02065e+4",
    		coalprodpercap: "2.59360e+3",
    		gasprod: "1.41475e+4",
    		oilprodpercap: "8.00406e+2",
    		oilprod: "3.82745e+4",
    		gasprodpercap: "6.70752e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1960,
    		coalprod: "5.20984e+4",
    		coalprodpercap: "2.59826e+3",
    		gasprod: "1.54193e+4",
    		oilprodpercap: "1.26467e+3",
    		oilprod: "4.16242e+4",
    		gasprodpercap: "6.69470e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1961,
    		coalprod: "4.94970e+4",
    		coalprodpercap: "2.64842e+3",
    		gasprod: "1.65839e+4",
    		oilprodpercap: "1.26479e+3",
    		oilprod: "4.43556e+4",
    		gasprodpercap: "6.19211e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1962,
    		coalprod: "5.06050e+4",
    		coalprodpercap: "2.64360e+3",
    		gasprod: "1.81579e+4",
    		oilprodpercap: "1.41516e+3",
    		oilprod: "4.82055e+4",
    		gasprodpercap: "6.13409e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1963,
    		coalprod: "5.19989e+4",
    		coalprodpercap: "2.69939e+3",
    		gasprod: "1.98751e+4",
    		oilprodpercap: "1.66121e+3",
    		oilprod: "5.18973e+4",
    		gasprodpercap: "5.91695e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1964,
    		coalprod: "5.41426e+4",
    		coalprodpercap: "2.75147e+3",
    		gasprod: "2.17283e+4",
    		oilprodpercap: "1.64342e+3",
    		oilprod: "5.62781e+4",
    		gasprodpercap: "6.03793e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1965,
    		coalprod: "5.49790e+4",
    		coalprodpercap: "2.54339e+3",
    		gasprod: "2.33060e+4",
    		oilprodpercap: "1.58853e+3",
    		oilprod: "8.59187e+4",
    		gasprodpercap: "7.15417e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1966,
    		coalprod: "5.55091e+4",
    		coalprodpercap: "2.52564e+3",
    		gasprod: "2.51056e+4",
    		oilprodpercap: "1.54011e+3",
    		oilprod: "9.35702e+4",
    		gasprodpercap: "7.66495e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1967,
    		coalprod: "5.35101e+4",
    		coalprodpercap: "2.44376e+3",
    		gasprod: "2.70732e+4",
    		oilprodpercap: "1.80644e+3",
    		oilprod: "1.00307e+5",
    		gasprodpercap: "7.69883e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1968,
    		coalprod: "5.48106e+4",
    		coalprodpercap: "2.39784e+3",
    		gasprod: "2.97609e+4",
    		oilprodpercap: "2.56008e+3",
    		oilprod: "1.09508e+5",
    		gasprodpercap: "8.22094e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1969,
    		coalprod: "5.57366e+4",
    		coalprodpercap: "2.36682e+3",
    		gasprod: "3.28722e+4",
    		oilprodpercap: "3.03515e+3",
    		oilprod: "1.18353e+5",
    		gasprodpercap: "8.41860e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1970,
    		coalprod: "5.77566e+4",
    		coalprodpercap: "2.43799e+3",
    		gasprod: "3.86314e+4",
    		oilprodpercap: "3.21617e+3",
    		oilprod: "1.30957e+5",
    		gasprodpercap: "8.45396e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1971,
    		coalprod: "5.71954e+4",
    		coalprodpercap: "2.33921e+3",
    		gasprod: "4.17476e+4",
    		oilprodpercap: "3.56162e+3",
    		oilprod: "1.40845e+5",
    		gasprodpercap: "8.66288e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1972,
    		coalprod: "5.67957e+4",
    		coalprodpercap: "2.35767e+3",
    		gasprod: "4.42961e+4",
    		oilprodpercap: "3.99679e+3",
    		oilprod: "1.50331e+5",
    		gasprodpercap: "8.66555e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1973,
    		coalprod: "5.77095e+4",
    		coalprodpercap: "2.38095e+3",
    		gasprod: "4.70711e+4",
    		oilprodpercap: "5.50410e+3",
    		oilprod: "1.66315e+5",
    		gasprodpercap: "8.97141e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1974,
    		coalprod: "5.79491e+4",
    		coalprodpercap: "2.33331e+3",
    		gasprod: "4.91360e+4",
    		oilprodpercap: "6.59712e+3",
    		oilprod: "1.68291e+5",
    		gasprodpercap: "7.85309e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1975,
    		coalprod: "6.14533e+4",
    		coalprodpercap: "2.46755e+3",
    		gasprod: "5.04280e+4",
    		oilprodpercap: "7.55429e+3",
    		oilprod: "1.59346e+5",
    		gasprodpercap: "6.64790e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1976,
    		coalprod: "6.31313e+4",
    		coalprodpercap: "2.53908e+3",
    		gasprod: "5.33691e+4",
    		oilprodpercap: "7.94300e+3",
    		oilprod: "1.74623e+5",
    		gasprodpercap: "6.93584e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1977,
    		coalprod: "6.49337e+4",
    		coalprodpercap: "2.59883e+3",
    		gasprod: "5.78967e+4",
    		oilprodpercap: "8.90046e+3",
    		oilprod: "1.80264e+5",
    		gasprodpercap: "6.37892e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1978,
    		coalprod: "6.59124e+4",
    		coalprodpercap: "2.61478e+3",
    		gasprod: "5.84556e+4",
    		oilprodpercap: "9.05949e+3",
    		oilprod: "1.80638e+5",
    		gasprodpercap: "6.05829e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1979,
    		coalprod: "6.95931e+4",
    		coalprodpercap: "2.72742e+3",
    		gasprod: "6.30260e+4",
    		oilprodpercap: "1.07826e+4",
    		oilprod: "1.87648e+5",
    		gasprodpercap: "6.09219e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1980,
    		coalprod: "6.80630e+4",
    		coalprodpercap: "1.39069e+3",
    		gasprod: "6.39045e+4",
    		oilprodpercap: "5.57269e+3",
    		oilprod: "1.81502e+5",
    		gasprodpercap: "2.76135e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1981,
    		coalprod: "9.79566e+4",
    		coalprodpercap: "1.64878e+3",
    		gasprod: "6.54160e+4",
    		oilprodpercap: "5.20558e+3",
    		oilprod: "1.69268e+5",
    		gasprodpercap: "2.17730e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1982,
    		coalprod: "1.01636e+5",
    		coalprodpercap: "1.71260e+3",
    		gasprod: "6.65965e+4",
    		oilprodpercap: "5.30746e+3",
    		oilprod: "1.59476e+5",
    		gasprodpercap: "1.79657e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1983,
    		coalprod: "1.02092e+5",
    		coalprodpercap: "1.70781e+3",
    		gasprod: "6.86669e+4",
    		oilprodpercap: "5.26061e+3",
    		oilprod: "1.56631e+5",
    		gasprodpercap: "1.68338e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1984,
    		coalprod: "1.05910e+5",
    		coalprodpercap: "1.73151e+3",
    		gasprod: "7.52969e+4",
    		oilprodpercap: "5.44869e+3",
    		oilprod: "1.58971e+5",
    		gasprodpercap: "1.64806e+4",
    		renewable: 0,
    		renewablepercap: 0
    	},
    	{
    		year: 1985,
    		coalprod: "1.11377e+5",
    		coalprodpercap: "2.17306e+3",
    		gasprod: "7.87426e+4",
    		oilprodpercap: "6.78354e+3",
    		oilprod: "1.56097e+5",
    		gasprodpercap: "1.54042e+4",
    		renewable: "1.73637e+3",
    		renewablepercap: "4.96277e+3"
    	},
    	{
    		year: 1986,
    		coalprod: "1.14162e+5",
    		coalprodpercap: "2.20380e+3",
    		gasprod: "8.15652e+4",
    		oilprodpercap: "6.83469e+3",
    		oilprod: "1.66224e+5",
    		gasprodpercap: "1.60334e+4",
    		renewable: "1.75188e+3",
    		renewablepercap: "4.92023e+3"
    	},
    	{
    		year: 1987,
    		coalprod: "1.16306e+5",
    		coalprodpercap: "2.21281e+3",
    		gasprod: "8.57631e+4",
    		oilprodpercap: "6.76093e+3",
    		oilprod: "1.67139e+5",
    		gasprodpercap: "1.49689e+4",
    		renewable: "1.77756e+3",
    		renewablepercap: "5.08245e+3"
    	},
    	{
    		year: 1988,
    		coalprod: "1.18974e+5",
    		coalprodpercap: "2.21675e+3",
    		gasprod: "8.99551e+4",
    		oilprodpercap: "6.83054e+3",
    		oilprod: "1.75346e+5",
    		gasprodpercap: "1.57606e+4",
    		renewable: "1.82888e+3",
    		renewablepercap: "5.21156e+3"
    	},
    	{
    		year: 1989,
    		coalprod: "1.20608e+5",
    		coalprodpercap: "2.17577e+3",
    		gasprod: "9.33637e+4",
    		oilprodpercap: "6.89497e+3",
    		oilprod: "1.78965e+5",
    		gasprodpercap: "1.65035e+4",
    		renewable: "1.83377e+3",
    		renewablepercap: "5.13648e+3"
    	},
    	{
    		year: 1990,
    		coalprod: "1.20649e+5",
    		coalprodpercap: "2.07433e+3",
    		gasprod: "9.60083e+4",
    		oilprodpercap: "6.59376e+3",
    		oilprod: "1.81961e+5",
    		gasprodpercap: "1.65255e+4",
    		renewable: "2.09921e+3",
    		renewablepercap: "4.69190e+3"
    	},
    	{
    		year: 1991,
    		coalprod: "1.16109e+5",
    		coalprodpercap: "1.99629e+3",
    		gasprod: "9.70123e+4",
    		oilprodpercap: "6.59617e+3",
    		oilprod: "1.79843e+5",
    		gasprodpercap: "1.58188e+4",
    		renewable: "2.15286e+3",
    		renewablepercap: "4.51939e+3"
    	},
    	{
    		year: 1992,
    		coalprod: "1.16199e+5",
    		coalprodpercap: "1.97706e+3",
    		gasprod: "9.53624e+4",
    		oilprodpercap: "6.08320e+3",
    		oilprod: "1.81371e+5",
    		gasprodpercap: "1.68366e+4",
    		renewable: "2.16742e+3",
    		renewablepercap: "4.61650e+3"
    	},
    	{
    		year: 1993,
    		coalprod: "1.12586e+5",
    		coalprodpercap: "1.89111e+3",
    		gasprod: "9.59564e+4",
    		oilprodpercap: "6.34047e+3",
    		oilprod: "1.81068e+5",
    		gasprodpercap: "1.75758e+4",
    		renewable: "2.30131e+3",
    		renewablepercap: "4.78043e+3"
    	},
    	{
    		year: 1994,
    		coalprod: "1.14093e+5",
    		coalprodpercap: "1.82920e+3",
    		gasprod: "9.65429e+4",
    		oilprodpercap: "6.11819e+3",
    		oilprod: "1.83215e+5",
    		gasprodpercap: "1.79734e+4",
    		renewable: "2.31569e+3",
    		renewablepercap: "4.72365e+3"
    	},
    	{
    		year: 1995,
    		coalprod: "1.17442e+5",
    		coalprodpercap: "1.80762e+3",
    		gasprod: "9.80389e+4",
    		oilprodpercap: "6.51139e+3",
    		oilprod: "1.85873e+5",
    		gasprodpercap: "1.80610e+4",
    		renewable: "2.44694e+3",
    		renewablepercap: "4.90284e+3"
    	},
    	{
    		year: 1996,
    		coalprod: "1.19031e+5",
    		coalprodpercap: "1.80200e+3",
    		gasprod: "1.01925e+5",
    		oilprodpercap: "6.72004e+3",
    		oilprod: "1.90248e+5",
    		gasprodpercap: "1.85954e+4",
    		renewable: "2.47580e+3",
    		renewablepercap: "4.58414e+3"
    	},
    	{
    		year: 1997,
    		coalprod: "1.20168e+5",
    		coalprodpercap: "1.85237e+3",
    		gasprod: "1.01696e+5",
    		oilprodpercap: "6.88898e+3",
    		oilprod: "1.95206e+5",
    		gasprodpercap: "1.89929e+4",
    		renewable: "2.52995e+3",
    		renewablepercap: "4.78935e+3"
    	},
    	{
    		year: 1998,
    		coalprod: "1.17715e+5",
    		coalprodpercap: "1.82816e+3",
    		gasprod: "1.04396e+5",
    		oilprodpercap: "6.89496e+3",
    		oilprod: "2.00730e+5",
    		gasprodpercap: "1.88147e+4",
    		renewable: "2.55463e+3",
    		renewablepercap: "5.04436e+3"
    	},
    	{
    		year: 1999,
    		coalprod: "1.18018e+5",
    		coalprodpercap: "1.76555e+3",
    		gasprod: "1.07421e+5",
    		oilprodpercap: "7.40353e+3",
    		oilprod: "1.96669e+5",
    		gasprodpercap: "1.81056e+4",
    		renewable: "2.57614e+3",
    		renewablepercap: "5.18473e+3"
    	},
    	{
    		year: 2000,
    		coalprod: "1.20742e+5",
    		coalprodpercap: "1.81878e+3",
    		gasprod: "1.11453e+5",
    		oilprodpercap: "8.08512e+3",
    		oilprod: "2.06537e+5",
    		gasprodpercap: "1.89318e+4",
    		renewable: "2.63221e+3",
    		renewablepercap: "5.53135e+3"
    	},
    	{
    		year: 2001,
    		coalprod: "1.26048e+5",
    		coalprodpercap: "1.87812e+3",
    		gasprod: "1.13798e+5",
    		oilprodpercap: "8.34305e+3",
    		oilprod: "2.06029e+5",
    		gasprodpercap: "1.85907e+4",
    		renewable: "2.57745e+3",
    		renewablepercap: "5.28144e+3"
    	},
    	{
    		year: 2002,
    		coalprod: "1.28220e+5",
    		coalprodpercap: "1.85426e+3",
    		gasprod: "1.17165e+5",
    		oilprodpercap: "8.65504e+3",
    		oilprod: "2.02761e+5",
    		gasprodpercap: "1.76084e+4",
    		renewable: "2.63486e+3",
    		renewablepercap: "5.27510e+3"
    	},
    	{
    		year: 2003,
    		coalprod: "1.39144e+5",
    		coalprodpercap: "1.90052e+3",
    		gasprod: "1.21683e+5",
    		oilprodpercap: "9.08985e+3",
    		oilprod: "2.12802e+5",
    		gasprodpercap: "1.83944e+4",
    		renewable: "2.65301e+3",
    		renewablepercap: "4.94464e+3"
    	},
    	{
    		year: 2004,
    		coalprod: "1.51658e+5",
    		coalprodpercap: "1.94137e+3",
    		gasprod: "1.26465e+5",
    		oilprodpercap: "9.49605e+3",
    		oilprod: "2.25553e+5",
    		gasprodpercap: "1.88679e+4",
    		renewable: "2.87562e+3",
    		renewablepercap: "5.20901e+3"
    	},
    	{
    		year: 2005,
    		coalprod: "1.62229e+5",
    		coalprodpercap: "1.94799e+3",
    		gasprod: "1.30425e+5",
    		oilprodpercap: "9.70893e+3",
    		oilprod: "2.29190e+5",
    		gasprodpercap: "1.83646e+4",
    		renewable: "3.01369e+3",
    		renewablepercap: "5.36766e+3"
    	},
    	{
    		year: 2006,
    		coalprod: "1.70972e+5",
    		coalprodpercap: "1.99876e+3",
    		gasprod: "1.35034e+5",
    		oilprodpercap: "9.75430e+3",
    		oilprod: "2.30748e+5",
    		gasprodpercap: "1.76758e+4",
    		renewable: "3.15877e+3",
    		renewablepercap: "5.34956e+3"
    	},
    	{
    		year: 2007,
    		coalprod: "1.79228e+5",
    		coalprodpercap: "2.01572e+3",
    		gasprod: "1.38437e+5",
    		oilprodpercap: "9.83414e+3",
    		oilprod: "2.30431e+5",
    		gasprodpercap: "1.63420e+4",
    		renewable: "3.26149e+3",
    		renewablepercap: "5.62736e+3"
    	},
    	{
    		year: 2008,
    		coalprod: "1.85501e+5",
    		coalprodpercap: "2.04418e+3",
    		gasprod: "1.43462e+5",
    		oilprodpercap: "9.90982e+3",
    		oilprod: "2.34536e+5",
    		gasprodpercap: "1.57141e+4",
    		renewable: "3.51198e+3",
    		renewablepercap: "6.27337e+3"
    	},
    	{
    		year: 2009,
    		coalprod: "1.87417e+5",
    		coalprodpercap: "2.00273e+3",
    		gasprod: "1.38610e+5",
    		oilprodpercap: "9.41494e+3",
    		oilprod: "2.28210e+5",
    		gasprodpercap: "1.41933e+4",
    		renewable: "3.59414e+3",
    		renewablepercap: "6.15693e+3"
    	},
    	{
    		year: 2010,
    		coalprod: "1.99146e+5",
    		coalprodpercap: "2.14915e+3",
    		gasprod: "1.49957e+5",
    		oilprodpercap: "1.01345e+4",
    		oilprod: "2.33346e+5",
    		gasprodpercap: "1.38498e+4",
    		renewable: "3.86866e+3",
    		renewablepercap: "6.22017e+3"
    	},
    	{
    		year: 2011,
    		coalprod: "2.14150e+5",
    		coalprodpercap: "2.24064e+3",
    		gasprod: "1.55534e+5",
    		oilprodpercap: "1.04398e+4",
    		oilprod: "2.36563e+5",
    		gasprodpercap: "1.33155e+4",
    		renewable: "4.08157e+3",
    		renewablepercap: "6.19639e+3"
    	},
    	{
    		year: 2012,
    		coalprod: "2.19232e+5",
    		coalprodpercap: "2.25172e+3",
    		gasprod: "1.58475e+5",
    		oilprodpercap: "1.05052e+4",
    		oilprod: "2.41842e+5",
    		gasprodpercap: "1.34488e+4",
    		renewable: "4.38973e+3",
    		renewablepercap: "6.47312e+3"
    	},
    	{
    		year: 2013,
    		coalprod: "2.23316e+5",
    		coalprodpercap: "2.26650e+3",
    		gasprod: "1.60522e+5",
    		oilprodpercap: "1.03410e+4",
    		oilprod: "2.40951e+5",
    		gasprodpercap: "1.25834e+4",
    		renewable: "4.67674e+3",
    		renewablepercap: "6.51939e+3"
    	},
    	{
    		year: 2014,
    		coalprod: "2.22424e+5",
    		coalprodpercap: "2.18178e+3",
    		gasprod: "1.62815e+5",
    		oilprodpercap: "1.02433e+4",
    		oilprod: "2.45261e+5",
    		gasprodpercap: "1.20490e+4",
    		renewable: "4.95064e+3",
    		renewablepercap: "6.42468e+3"
    	},
    	{
    		year: 2015,
    		coalprod: "2.17978e+5",
    		coalprodpercap: "2.11704e+3",
    		gasprod: "1.66065e+5",
    		oilprodpercap: "1.02516e+4",
    		oilprod: "2.52853e+5",
    		gasprodpercap: "1.18106e+4",
    		renewable: "5.17142e+3",
    		renewablepercap: "6.55512e+3"
    	},
    	{
    		year: 2016,
    		coalprod: "2.07453e+5",
    		coalprodpercap: "2.12739e+3",
    		gasprod: "1.68648e+5",
    		oilprodpercap: "9.93311e+3",
    		oilprod: "2.56012e+5",
    		gasprodpercap: "1.15877e+4",
    		renewable: "5.48859e+3",
    		renewablepercap: "6.55215e+3"
    	},
    	{
    		year: 2017,
    		coalprod: "1.69898e+5",
    		coalprodpercap: "5.77117e+3",
    		gasprod: "1.35640e+5",
    		oilprodpercap: "2.80185e+4",
    		oilprod: "1.88604e+5",
    		gasprodpercap: "3.16496e+4",
    		renewable: "5.85847e+3",
    		renewablepercap: "6.65773e+3"
    	},
    	{
    		year: 2018,
    		coalprod: "1.78772e+5",
    		coalprodpercap: "5.92385e+3",
    		gasprod: "1.41750e+5",
    		oilprodpercap: "2.78800e+4",
    		oilprod: "1.92320e+5",
    		gasprodpercap: "3.11790e+4",
    		renewable: "6.24944e+3",
    		renewablepercap: "6.74049e+3"
    	},
    	{
    		year: 2019,
    		coalprod: "1.81956e+5",
    		coalprodpercap: "5.89346e+3",
    		gasprod: "1.45853e+5",
    		oilprodpercap: "2.79363e+4",
    		oilprod: "1.91272e+5",
    		gasprodpercap: "3.04259e+4",
    		renewable: "6.59880e+3",
    		renewablepercap: "6.68593e+3"
    	},
    	{
    		year: 2020,
    		coalprod: "1.74004e+5",
    		coalprodpercap: "5.11397e+3",
    		gasprod: "1.41184e+5",
    		oilprodpercap: "2.64156e+4",
    		oilprod: "1.77459e+5",
    		gasprodpercap: "2.75710e+4",
    		renewable: "7.05384e+3",
    		renewablepercap: "6.96572e+3"
    	}
    ];

    /* src\components\FFRenChart.svelte generated by Svelte v3.31.0 */

    const { Object: Object_1 } = internal.globals;
    const file$3 = "src\\components\\FFRenChart.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[34] = list[i];
    	child_ctx[36] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[37] = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[40] = list[i];
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[34] = list[i];
    	child_ctx[36] = i;
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[44] = list[i];
    	child_ctx[36] = i;
    	return child_ctx;
    }

    // (143:8) {#each indicatorsUsed as ind, i}
    function create_each_block_5(ctx) {
    	let div1;
    	let div0;
    	let div0_style_value;
    	let t0;
    	let span;
    	let t1_value = /*encodeInd*/ ctx[17](/*ind*/ ctx[44]) + "";
    	let t1;
    	let t2;

    	const block = {
    		c: function create() {
    			div1 = internal.element("div");
    			div0 = internal.element("div");
    			t0 = internal.space();
    			span = internal.element("span");
    			t1 = internal.text(t1_value);
    			t2 = internal.space();
    			internal.attr_dev(div0, "class", "legend-color svelte-iul5k");
    			internal.attr_dev(div0, "style", div0_style_value = `background-color: ${d3ScaleChromatic.schemeCategory10[/*i*/ ctx[36]]};`);
    			internal.add_location(div0, file$3, 144, 16, 5024);
    			internal.attr_dev(span, "class", "");
    			internal.add_location(span, file$3, 145, 16, 5126);
    			internal.attr_dev(div1, "class", "legend-container svelte-iul5k");
    			internal.add_location(div1, file$3, 143, 12, 4976);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, div1, anchor);
    			internal.append_dev(div1, div0);
    			internal.append_dev(div1, t0);
    			internal.append_dev(div1, span);
    			internal.append_dev(span, t1);
    			internal.append_dev(div1, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*encodeInd, indicatorsUsed*/ 131074 && t1_value !== (t1_value = /*encodeInd*/ ctx[17](/*ind*/ ctx[44]) + "")) internal.set_data_dev(t1, t1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(div1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_5.name,
    		type: "each",
    		source: "(143:8) {#each indicatorsUsed as ind, i}",
    		ctx
    	});

    	return block;
    }

    // (162:12) {#each seriesData as sData, i}
    function create_each_block_4(ctx) {
    	let path;
    	let path_d_value;
    	let path_fill_value;

    	const block = {
    		c: function create() {
    			path = internal.svg_element("path");
    			internal.attr_dev(path, "d", path_d_value = /*areaPath*/ ctx[8](/*sData*/ ctx[34]));
    			internal.attr_dev(path, "fill", path_fill_value = d3ScaleChromatic.schemeCategory10[/*i*/ ctx[36]]);
    			internal.attr_dev(path, "class", "path");
    			internal.add_location(path, file$3, 162, 16, 5612);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, path, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*areaPath, seriesData*/ 272 && path_d_value !== (path_d_value = /*areaPath*/ ctx[8](/*sData*/ ctx[34]))) {
    				internal.attr_dev(path, "d", path_d_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(path);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_4.name,
    		type: "each",
    		source: "(162:12) {#each seriesData as sData, i}",
    		ctx
    	});

    	return block;
    }

    // (181:16) {#each sDates.filter(dt => dt.getFullYear() % 20 === 0) as date}
    function create_each_block_3(ctx) {
    	let g;
    	let text_1;
    	let t_value = /*date*/ ctx[40].getFullYear() + "";
    	let t;
    	let text_1_x_value;

    	const block = {
    		c: function create() {
    			g = internal.svg_element("g");
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(text_1, "class", "x-tick-label");
    			internal.attr_dev(text_1, "x", text_1_x_value = /*x*/ ctx[2](/*date*/ ctx[40]));
    			internal.attr_dev(text_1, "y", height);
    			internal.attr_dev(text_1, "text-anchor", "middle");
    			internal.add_location(text_1, file$3, 182, 24, 6318);
    			internal.attr_dev(g, "class", "x-tick");
    			internal.add_location(g, file$3, 181, 20, 6274);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g, anchor);
    			internal.append_dev(g, text_1);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*sDates*/ 32 && t_value !== (t_value = /*date*/ ctx[40].getFullYear() + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*x, sDates*/ 36 && text_1_x_value !== (text_1_x_value = /*x*/ ctx[2](/*date*/ ctx[40]))) {
    				internal.attr_dev(text_1, "x", text_1_x_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3.name,
    		type: "each",
    		source: "(181:16) {#each sDates.filter(dt => dt.getFullYear() % 20 === 0) as date}",
    		ctx
    	});

    	return block;
    }

    // (195:16) {#each yValRange as yVal}
    function create_each_block_2(ctx) {
    	let g;
    	let text_1;
    	let t_value = /*yVal*/ ctx[37] + "";
    	let t;
    	let text_1_x_value;
    	let text_1_y_value;
    	let line;
    	let line_x__value;
    	let line_y__value;
    	let line_y__value_1;

    	const block = {
    		c: function create() {
    			g = internal.svg_element("g");
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			line = internal.svg_element("line");
    			internal.attr_dev(text_1, "class", "y-tick-label");
    			internal.attr_dev(text_1, "x", text_1_x_value = 0);
    			internal.attr_dev(text_1, "y", text_1_y_value = /*y*/ ctx[3](/*yVal*/ ctx[37]));
    			internal.attr_dev(text_1, "dy", "18");
    			internal.add_location(text_1, file$3, 196, 24, 6828);
    			internal.attr_dev(line, "class", "y-tick-line");
    			internal.attr_dev(line, "x1", line_x__value = 0);
    			internal.attr_dev(line, "x2", width);
    			internal.attr_dev(line, "y1", line_y__value = /*y*/ ctx[3](/*yVal*/ ctx[37]));
    			internal.attr_dev(line, "y2", line_y__value_1 = /*y*/ ctx[3](/*yVal*/ ctx[37]));
    			internal.attr_dev(line, "stroke", "#cccccc");
    			internal.attr_dev(line, "stroke-width", "0.5");
    			internal.add_location(line, file$3, 204, 24, 7114);
    			internal.attr_dev(g, "class", "y-tick");
    			internal.add_location(g, file$3, 195, 20, 6784);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g, anchor);
    			internal.append_dev(g, text_1);
    			internal.append_dev(text_1, t);
    			internal.append_dev(g, line);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*yValRange*/ 512 && t_value !== (t_value = /*yVal*/ ctx[37] + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*y, yValRange*/ 520 && text_1_y_value !== (text_1_y_value = /*y*/ ctx[3](/*yVal*/ ctx[37]))) {
    				internal.attr_dev(text_1, "y", text_1_y_value);
    			}

    			if (dirty[0] & /*y, yValRange*/ 520 && line_y__value !== (line_y__value = /*y*/ ctx[3](/*yVal*/ ctx[37]))) {
    				internal.attr_dev(line, "y1", line_y__value);
    			}

    			if (dirty[0] & /*y, yValRange*/ 520 && line_y__value_1 !== (line_y__value_1 = /*y*/ ctx[3](/*yVal*/ ctx[37]))) {
    				internal.attr_dev(line, "y2", line_y__value_1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(195:16) {#each yValRange as yVal}",
    		ctx
    	});

    	return block;
    }

    // (240:16) {#each seriesData as sData, i}
    function create_each_block_1(ctx) {
    	let text_1;
    	let t_value = /*getTooltipText*/ ctx[16](/*sData*/ ctx[34], /*i*/ ctx[36]) + "";
    	let t;
    	let text_1_x_value;
    	let text_1_text_anchor_value;
    	let text_1_dy_value;
    	let text_1_fill_value;

    	const block = {
    		c: function create() {
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(text_1, "class", "tt-indicator");

    			internal.attr_dev(text_1, "x", text_1_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 10
    			: /*mouseX*/ ctx[12] + 10);

    			internal.attr_dev(text_1, "y", "40");
    			internal.attr_dev(text_1, "text-anchor", text_1_text_anchor_value = /*isCursorOnRight*/ ctx[11] ? "end" : "start");
    			internal.attr_dev(text_1, "dy", text_1_dy_value = (/*i*/ ctx[36] + 1) * 20);
    			internal.attr_dev(text_1, "visibility", /*ttVisibility*/ ctx[7]);
    			internal.attr_dev(text_1, "fill", text_1_fill_value = d3ScaleChromatic.schemeCategory10[/*i*/ ctx[36]]);
    			internal.add_location(text_1, file$3, 240, 20, 8411);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, text_1, anchor);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*getTooltipText, seriesData*/ 65552 && t_value !== (t_value = /*getTooltipText*/ ctx[16](/*sData*/ ctx[34], /*i*/ ctx[36]) + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*isCursorOnRight, mouseX*/ 6144 && text_1_x_value !== (text_1_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 10
    			: /*mouseX*/ ctx[12] + 10)) {
    				internal.attr_dev(text_1, "x", text_1_x_value);
    			}

    			if (dirty[0] & /*isCursorOnRight*/ 2048 && text_1_text_anchor_value !== (text_1_text_anchor_value = /*isCursorOnRight*/ ctx[11] ? "end" : "start")) {
    				internal.attr_dev(text_1, "text-anchor", text_1_text_anchor_value);
    			}

    			if (dirty[0] & /*ttVisibility*/ 128) {
    				internal.attr_dev(text_1, "visibility", /*ttVisibility*/ ctx[7]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(text_1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(240:16) {#each seriesData as sData, i}",
    		ctx
    	});

    	return block;
    }

    // (267:16) {#each seriesData as sdpt}
    function create_each_block$1(ctx) {
    	let circle;
    	let circle_cx_value;
    	let circle_cy_value;

    	const block = {
    		c: function create() {
    			circle = internal.svg_element("circle");
    			internal.attr_dev(circle, "r", "5");
    			internal.attr_dev(circle, "cx", circle_cx_value = /*pointX*/ ctx[14](/*sdpt*/ ctx[31]));
    			internal.attr_dev(circle, "cy", circle_cy_value = /*pointY*/ ctx[15](/*sdpt*/ ctx[31]));
    			internal.attr_dev(circle, "stroke", "#000000");
    			internal.attr_dev(circle, "fill", "none");
    			internal.attr_dev(circle, "visibility", /*ttVisibility*/ ctx[7]);
    			internal.add_location(circle, file$3, 267, 20, 9431);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, circle, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*pointX, seriesData*/ 16400 && circle_cx_value !== (circle_cx_value = /*pointX*/ ctx[14](/*sdpt*/ ctx[31]))) {
    				internal.attr_dev(circle, "cx", circle_cx_value);
    			}

    			if (dirty[0] & /*pointY, seriesData*/ 32784 && circle_cy_value !== (circle_cy_value = /*pointY*/ ctx[15](/*sdpt*/ ctx[31]))) {
    				internal.attr_dev(circle, "cy", circle_cy_value);
    			}

    			if (dirty[0] & /*ttVisibility*/ 128) {
    				internal.attr_dev(circle, "visibility", /*ttVisibility*/ ctx[7]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(circle);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(267:16) {#each seriesData as sdpt}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div2;
    	let div0;
    	let input;
    	let t0;
    	let label;
    	let t2;
    	let div1;
    	let t3;
    	let svg;
    	let g0;
    	let g3;
    	let g1;
    	let line0;
    	let line0_x__value;
    	let line0_y__value;
    	let line0_y__value_1;
    	let g2;
    	let g7;
    	let g4;
    	let rect;
    	let rect_x_value;
    	let text_1;
    	let t4;
    	let text_1_x_value;
    	let text_1_text_anchor_value;
    	let g5;
    	let line1;
    	let line1_x__value;
    	let line1_x__value_1;
    	let g6;
    	let svg_viewBox_value;
    	let mounted;
    	let dispose;
    	let each_value_5 = /*indicatorsUsed*/ ctx[1];
    	internal.validate_each_argument(each_value_5);
    	let each_blocks_5 = [];

    	for (let i = 0; i < each_value_5.length; i += 1) {
    		each_blocks_5[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
    	}

    	let each_value_4 = /*seriesData*/ ctx[4];
    	internal.validate_each_argument(each_value_4);
    	let each_blocks_4 = [];

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		each_blocks_4[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
    	}

    	let each_value_3 = /*sDates*/ ctx[5].filter(func);
    	internal.validate_each_argument(each_value_3);
    	let each_blocks_3 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_3[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	let each_value_2 = /*yValRange*/ ctx[9];
    	internal.validate_each_argument(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*seriesData*/ ctx[4];
    	internal.validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*seriesData*/ ctx[4];
    	internal.validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div2 = internal.element("div");
    			div0 = internal.element("div");
    			input = internal.element("input");
    			t0 = internal.space();
    			label = internal.element("label");
    			label.textContent = "Show per capita values (kWh)";
    			t2 = internal.space();
    			div1 = internal.element("div");

    			for (let i = 0; i < each_blocks_5.length; i += 1) {
    				each_blocks_5[i].c();
    			}

    			t3 = internal.space();
    			svg = internal.svg_element("svg");
    			g0 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].c();
    			}

    			g3 = internal.svg_element("g");
    			g1 = internal.svg_element("g");
    			line0 = internal.svg_element("line");

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			g2 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			g7 = internal.svg_element("g");
    			g4 = internal.svg_element("g");
    			rect = internal.svg_element("rect");
    			text_1 = internal.svg_element("text");
    			t4 = internal.text(/*year*/ ctx[10]);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			g5 = internal.svg_element("g");
    			line1 = internal.svg_element("line");
    			g6 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			internal.attr_dev(input, "type", "checkbox");
    			internal.attr_dev(input, "id", "toggle-gdp-per-cap");
    			internal.add_location(input, file$3, 138, 8, 4728);
    			internal.attr_dev(label, "for", "toggle-gdp-per-cap");
    			internal.add_location(label, file$3, 139, 8, 4813);
    			internal.attr_dev(div0, "class", "ui-controls svelte-iul5k");
    			internal.add_location(div0, file$3, 137, 4, 4693);
    			internal.attr_dev(div1, "class", "legends svelte-iul5k");
    			internal.add_location(div1, file$3, 141, 4, 4899);
    			internal.attr_dev(g0, "class", "paths-group");
    			internal.add_location(g0, file$3, 160, 8, 5527);
    			internal.attr_dev(line0, "class", "horizontal-rule");
    			internal.attr_dev(line0, "x1", line0_x__value = 0);
    			internal.attr_dev(line0, "x2", width);
    			internal.attr_dev(line0, "y1", line0_y__value = height - /*margin*/ ctx[18].top);
    			internal.attr_dev(line0, "y2", line0_y__value_1 = height - /*margin*/ ctx[18].top);
    			internal.attr_dev(line0, "stroke", "#333333");
    			internal.attr_dev(line0, "stroke-width", "1");
    			internal.add_location(line0, file$3, 171, 16, 5872);
    			internal.attr_dev(g1, "class", "x-axis");
    			internal.add_location(g1, file$3, 170, 12, 5836);
    			internal.attr_dev(g2, "class", "y-axis");
    			internal.add_location(g2, file$3, 193, 12, 6701);
    			internal.attr_dev(g3, "class", "axes");
    			internal.add_location(g3, file$3, 169, 8, 5806);

    			internal.attr_dev(rect, "x", rect_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 185
    			: /*mouseX*/ ctx[12]);

    			internal.attr_dev(rect, "y", "35");
    			internal.attr_dev(rect, "width", "180");
    			internal.attr_dev(rect, "height", "100");
    			internal.attr_dev(rect, "fill", "#fff");
    			internal.attr_dev(rect, "stroke", "#aaa");
    			internal.attr_dev(rect, "stroke-width", "0.5");
    			internal.attr_dev(rect, "fill-opacity", "0.75");
    			internal.attr_dev(rect, "visibility", /*ttVisibility*/ ctx[7]);
    			internal.add_location(rect, file$3, 219, 16, 7615);
    			internal.attr_dev(text_1, "class", "tt-year");

    			internal.attr_dev(text_1, "x", text_1_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 10
    			: /*mouseX*/ ctx[12] + 10);

    			internal.attr_dev(text_1, "y", "25");
    			internal.attr_dev(text_1, "text-anchor", text_1_text_anchor_value = /*isCursorOnRight*/ ctx[11] ? "end" : "start");
    			internal.attr_dev(text_1, "visibility", /*ttVisibility*/ ctx[7]);
    			internal.add_location(text_1, file$3, 230, 16, 8014);
    			internal.attr_dev(g4, "class", "tt-values");
    			internal.add_location(g4, file$3, 218, 12, 7576);
    			internal.attr_dev(line1, "x1", line1_x__value = /*mouseX*/ ctx[12] - 2.5);
    			internal.attr_dev(line1, "x2", line1_x__value_1 = /*mouseY*/ ctx[13] - 2.5);
    			internal.attr_dev(line1, "y1", "0");
    			internal.attr_dev(line1, "y2", /*yMax*/ ctx[6]);
    			internal.attr_dev(line1, "stroke", "#000000");
    			internal.attr_dev(line1, "opacity", "0.5");
    			internal.attr_dev(line1, "stroke-dasharray", "2 3");
    			internal.attr_dev(line1, "visibility", /*ttVisibility*/ ctx[7]);
    			internal.add_location(line1, file$3, 254, 16, 8982);
    			internal.attr_dev(g5, "class", "vline");
    			internal.add_location(g5, file$3, 253, 12, 8947);
    			internal.attr_dev(g6, "class", "points-group");
    			internal.add_location(g6, file$3, 265, 12, 9341);
    			internal.attr_dev(g7, "class", "tooltip");
    			internal.add_location(g7, file$3, 217, 8, 7543);
    			internal.attr_dev(svg, "class", "svg-area-chart");
    			internal.attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + width + " " + height);
    			internal.attr_dev(svg, "width", width);
    			internal.attr_dev(svg, "height", height);
    			internal.add_location(svg, file$3, 149, 4, 5219);
    			internal.attr_dev(div2, "class", "area-chart svelte-iul5k");
    			internal.add_location(div2, file$3, 136, 0, 4663);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, div2, anchor);
    			internal.append_dev(div2, div0);
    			internal.append_dev(div0, input);
    			input.checked = /*togglePercap*/ ctx[0];
    			internal.append_dev(div0, t0);
    			internal.append_dev(div0, label);
    			internal.append_dev(div2, t2);
    			internal.append_dev(div2, div1);

    			for (let i = 0; i < each_blocks_5.length; i += 1) {
    				each_blocks_5[i].m(div1, null);
    			}

    			internal.append_dev(div2, t3);
    			internal.append_dev(div2, svg);
    			internal.append_dev(svg, g0);

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].m(g0, null);
    			}

    			internal.append_dev(svg, g3);
    			internal.append_dev(g3, g1);
    			internal.append_dev(g1, line0);

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(g1, null);
    			}

    			internal.append_dev(g3, g2);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(g2, null);
    			}

    			internal.append_dev(svg, g7);
    			internal.append_dev(g7, g4);
    			internal.append_dev(g4, rect);
    			internal.append_dev(g4, text_1);
    			internal.append_dev(text_1, t4);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g4, null);
    			}

    			internal.append_dev(g7, g5);
    			internal.append_dev(g5, line1);
    			internal.append_dev(g7, g6);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g6, null);
    			}

    			if (!mounted) {
    				dispose = [
    					internal.listen_dev(input, "change", /*input_change_handler*/ ctx[25]),
    					internal.listen_dev(svg, "mouseover", /*handleMouseOver*/ ctx[19], false, false, false),
    					internal.listen_dev(svg, "mousemove", /*handleMouseMove*/ ctx[20], false, false, false),
    					internal.listen_dev(svg, "mouseout", /*handleMouseOut*/ ctx[21], false, false, false),
    					internal.listen_dev(svg, "focus", handleFocus, false, false, false),
    					internal.listen_dev(svg, "blur", handleBlur, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*togglePercap*/ 1) {
    				input.checked = /*togglePercap*/ ctx[0];
    			}

    			if (dirty[0] & /*encodeInd, indicatorsUsed*/ 131074) {
    				each_value_5 = /*indicatorsUsed*/ ctx[1];
    				internal.validate_each_argument(each_value_5);
    				let i;

    				for (i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5(ctx, each_value_5, i);

    					if (each_blocks_5[i]) {
    						each_blocks_5[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_5[i] = create_each_block_5(child_ctx);
    						each_blocks_5[i].c();
    						each_blocks_5[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks_5.length; i += 1) {
    					each_blocks_5[i].d(1);
    				}

    				each_blocks_5.length = each_value_5.length;
    			}

    			if (dirty[0] & /*areaPath, seriesData*/ 272) {
    				each_value_4 = /*seriesData*/ ctx[4];
    				internal.validate_each_argument(each_value_4);
    				let i;

    				for (i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4(ctx, each_value_4, i);

    					if (each_blocks_4[i]) {
    						each_blocks_4[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_4[i] = create_each_block_4(child_ctx);
    						each_blocks_4[i].c();
    						each_blocks_4[i].m(g0, null);
    					}
    				}

    				for (; i < each_blocks_4.length; i += 1) {
    					each_blocks_4[i].d(1);
    				}

    				each_blocks_4.length = each_value_4.length;
    			}

    			if (dirty[0] & /*x, sDates*/ 36) {
    				each_value_3 = /*sDates*/ ctx[5].filter(func);
    				internal.validate_each_argument(each_value_3);
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks_3[i]) {
    						each_blocks_3[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_3[i] = create_each_block_3(child_ctx);
    						each_blocks_3[i].c();
    						each_blocks_3[i].m(g1, null);
    					}
    				}

    				for (; i < each_blocks_3.length; i += 1) {
    					each_blocks_3[i].d(1);
    				}

    				each_blocks_3.length = each_value_3.length;
    			}

    			if (dirty[0] & /*y, yValRange*/ 520) {
    				each_value_2 = /*yValRange*/ ctx[9];
    				internal.validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(g2, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty[0] & /*isCursorOnRight, mouseX*/ 6144 && rect_x_value !== (rect_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 185
    			: /*mouseX*/ ctx[12])) {
    				internal.attr_dev(rect, "x", rect_x_value);
    			}

    			if (dirty[0] & /*ttVisibility*/ 128) {
    				internal.attr_dev(rect, "visibility", /*ttVisibility*/ ctx[7]);
    			}

    			if (dirty[0] & /*year*/ 1024) internal.set_data_dev(t4, /*year*/ ctx[10]);

    			if (dirty[0] & /*isCursorOnRight, mouseX*/ 6144 && text_1_x_value !== (text_1_x_value = /*isCursorOnRight*/ ctx[11]
    			? /*mouseX*/ ctx[12] - 10
    			: /*mouseX*/ ctx[12] + 10)) {
    				internal.attr_dev(text_1, "x", text_1_x_value);
    			}

    			if (dirty[0] & /*isCursorOnRight*/ 2048 && text_1_text_anchor_value !== (text_1_text_anchor_value = /*isCursorOnRight*/ ctx[11] ? "end" : "start")) {
    				internal.attr_dev(text_1, "text-anchor", text_1_text_anchor_value);
    			}

    			if (dirty[0] & /*ttVisibility*/ 128) {
    				internal.attr_dev(text_1, "visibility", /*ttVisibility*/ ctx[7]);
    			}

    			if (dirty[0] & /*isCursorOnRight, mouseX, ttVisibility, getTooltipText, seriesData*/ 71824) {
    				each_value_1 = /*seriesData*/ ctx[4];
    				internal.validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(g4, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty[0] & /*mouseX*/ 4096 && line1_x__value !== (line1_x__value = /*mouseX*/ ctx[12] - 2.5)) {
    				internal.attr_dev(line1, "x1", line1_x__value);
    			}

    			if (dirty[0] & /*mouseY*/ 8192 && line1_x__value_1 !== (line1_x__value_1 = /*mouseY*/ ctx[13] - 2.5)) {
    				internal.attr_dev(line1, "x2", line1_x__value_1);
    			}

    			if (dirty[0] & /*yMax*/ 64) {
    				internal.attr_dev(line1, "y2", /*yMax*/ ctx[6]);
    			}

    			if (dirty[0] & /*ttVisibility*/ 128) {
    				internal.attr_dev(line1, "visibility", /*ttVisibility*/ ctx[7]);
    			}

    			if (dirty[0] & /*pointX, seriesData, pointY, ttVisibility*/ 49296) {
    				each_value = /*seriesData*/ ctx[4];
    				internal.validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g6, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: internal.noop,
    		o: internal.noop,
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(div2);
    			internal.destroy_each(each_blocks_5, detaching);
    			internal.destroy_each(each_blocks_4, detaching);
    			internal.destroy_each(each_blocks_3, detaching);
    			internal.destroy_each(each_blocks_2, detaching);
    			internal.destroy_each(each_blocks_1, detaching);
    			internal.destroy_each(each_blocks, detaching);
    			mounted = false;
    			internal.run_all(dispose);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const width = 600;
    const height = 400;
    const X_OFFSET = 500;

    // Encode legend labels
    const TWH = "Production (TWh)";

    const PC_KWH = "Production per capita (kWh)";

    // To prevent throwing an error where mouseover and mouseout requires
    // accompanying onfocus and onblur
    function handleFocus() {
    	
    }

    function handleBlur() {
    	
    }

    const func = dt => dt.getFullYear() % 20 === 0;

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	internal.validate_slots("FFRenChart", slots, []);
    	const allInds = Object.keys(ffRenData[0]).slice(1).sort((indA, indB) => indA.localeCompare(indB));
    	const indicators = allInds.filter(ind => !ind.includes("percap"));
    	const indicatorsPercap = allInds.filter(ind => ind.includes("percap"));
    	const margin = { top: 20, right: 20, bottom: 20, left: 50 };
    	let togglePercap = false;
    	let ttVisibility = "hidden";

    	function handleMouseOver() {
    		$$invalidate(7, ttVisibility = "visible");
    	}

    	function handleMouseMove(e) {
    		const { pageX, pageY } = e;
    		$$invalidate(12, mouseX = pageX - X_OFFSET);
    		$$invalidate(13, mouseY = pageY);
    		$$invalidate(10, year = xRev(mouseX).getFullYear());
    		$$invalidate(23, sIndex = sYears.indexOf(year));
    		$$invalidate(11, isCursorOnRight = mouseX > x(width / 2));
    		let isXWithinRange = year > d3Array.min(sYears) && year < d3Array.max(sYears);
    		$$invalidate(7, ttVisibility = isXWithinRange ? "visible" : "hidden");
    	}

    	function handleMouseOut() {
    		$$invalidate(7, ttVisibility = "hidden");
    	}

    	const writable_props = [];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<FFRenChart> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		togglePercap = this.checked;
    		$$invalidate(0, togglePercap);
    	}

    	$$self.$capture_state = () => ({
    		aq: aq__namespace,
    		ffRenData,
    		area: d3Shape.area,
    		stack: d3Shape.stack,
    		scaleLinear: d3Scale.scaleLinear,
    		scaleUtc: d3Scale.scaleUtc,
    		max: d3Array.max,
    		min: d3Array.min,
    		extent: d3Array.extent,
    		range: d3Array.range,
    		schemeCategory10: d3ScaleChromatic.schemeCategory10,
    		allInds,
    		indicators,
    		indicatorsPercap,
    		width,
    		height,
    		margin,
    		togglePercap,
    		ttVisibility,
    		X_OFFSET,
    		handleMouseOver,
    		handleMouseMove,
    		handleMouseOut,
    		handleFocus,
    		handleBlur,
    		TWH,
    		PC_KWH,
    		indicatorsUsed,
    		areaData,
    		x,
    		y,
    		seriesData,
    		sDates,
    		sYears,
    		areaPath,
    		yMax,
    		yValRange,
    		xRev,
    		year,
    		sIndex,
    		isCursorOnRight,
    		mouseX,
    		mouseY,
    		pointX,
    		pointY,
    		getTooltipText,
    		energyUnit,
    		encodeInd
    	});

    	$$self.$inject_state = $$props => {
    		if ("togglePercap" in $$props) $$invalidate(0, togglePercap = $$props.togglePercap);
    		if ("ttVisibility" in $$props) $$invalidate(7, ttVisibility = $$props.ttVisibility);
    		if ("indicatorsUsed" in $$props) $$invalidate(1, indicatorsUsed = $$props.indicatorsUsed);
    		if ("areaData" in $$props) $$invalidate(22, areaData = $$props.areaData);
    		if ("x" in $$props) $$invalidate(2, x = $$props.x);
    		if ("y" in $$props) $$invalidate(3, y = $$props.y);
    		if ("seriesData" in $$props) $$invalidate(4, seriesData = $$props.seriesData);
    		if ("sDates" in $$props) $$invalidate(5, sDates = $$props.sDates);
    		if ("sYears" in $$props) sYears = $$props.sYears;
    		if ("areaPath" in $$props) $$invalidate(8, areaPath = $$props.areaPath);
    		if ("yMax" in $$props) $$invalidate(6, yMax = $$props.yMax);
    		if ("yValRange" in $$props) $$invalidate(9, yValRange = $$props.yValRange);
    		if ("xRev" in $$props) xRev = $$props.xRev;
    		if ("year" in $$props) $$invalidate(10, year = $$props.year);
    		if ("sIndex" in $$props) $$invalidate(23, sIndex = $$props.sIndex);
    		if ("isCursorOnRight" in $$props) $$invalidate(11, isCursorOnRight = $$props.isCursorOnRight);
    		if ("mouseX" in $$props) $$invalidate(12, mouseX = $$props.mouseX);
    		if ("mouseY" in $$props) $$invalidate(13, mouseY = $$props.mouseY);
    		if ("pointX" in $$props) $$invalidate(14, pointX = $$props.pointX);
    		if ("pointY" in $$props) $$invalidate(15, pointY = $$props.pointY);
    		if ("getTooltipText" in $$props) $$invalidate(16, getTooltipText = $$props.getTooltipText);
    		if ("energyUnit" in $$props) $$invalidate(24, energyUnit = $$props.energyUnit);
    		if ("encodeInd" in $$props) $$invalidate(17, encodeInd = $$props.encodeInd);
    	};

    	let indicatorsUsed;
    	let areaData;
    	let x;
    	let y;
    	let seriesData;
    	let sDates;
    	let sYears;
    	let areaPath;
    	let yMax;
    	let yValRange;
    	let xRev;
    	let year;
    	let sIndex;
    	let isCursorOnRight;
    	let mouseX;
    	let mouseY;
    	let pointX;
    	let pointY;
    	let getTooltipText;
    	let energyUnit;
    	let encodeInd;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*togglePercap*/ 1) {
    			 $$invalidate(1, indicatorsUsed = !togglePercap ? indicators : indicatorsPercap);
    		}

    		if ($$self.$$.dirty[0] & /*indicatorsUsed, togglePercap*/ 3) {
    			 $$invalidate(22, areaData = aq.from(ffRenData).derive(indicatorsUsed.reduce(
    				(obj, ind) => {
    					return {
    						...obj,
    						[ind]: aq.escape(d => {
    							if (d[ind]) {
    								const [b, e] = d[ind].split("e");
    								return b * Math.pow(10, e);
    							} else return 0;
    						})
    					};
    				},
    				{}
    			)).derive({
    				date: aq.escape(d => new Date(d.year, 0, 1)),
    				total: aq.escape(d => indicatorsUsed.reduce(
    					(sum, ind) => {
    						return sum + d[ind];
    					},
    					0
    				))
    			}).// .relocate( "date", { before: "year" } )
    			select(aq.not(!togglePercap ? indicatorsPercap : indicators, "year")).orderby("date").objects());
    		}

    		if ($$self.$$.dirty[0] & /*areaData*/ 4194304) {
    			 $$invalidate(2, x = d3Scale.scaleUtc().domain(d3Array.extent(areaData, d => d.date)).range([margin.left, width - margin.right]));
    		}

    		if ($$self.$$.dirty[0] & /*areaData, indicatorsUsed*/ 4194306) {
    			 $$invalidate(3, y = d3Scale.scaleLinear().domain([
    				0,
    				d3Array.max(areaData, d => indicatorsUsed.reduce(
    					(sum, ind) => {
    						return sum + d[ind];
    					},
    					0
    				))
    			]).nice().range([height - margin.bottom, margin.top]));
    		}

    		if ($$self.$$.dirty[0] & /*indicatorsUsed, areaData*/ 4194306) {
    			 $$invalidate(4, seriesData = d3Shape.stack().keys(indicatorsUsed)(areaData).map(sData => sData.map((d, i) => {
    				return { ...d, data: areaData[i] };
    			})));
    		}

    		if ($$self.$$.dirty[0] & /*seriesData*/ 16) {
    			 $$invalidate(5, sDates = seriesData[0].map(d => d.data.date));
    		}

    		if ($$self.$$.dirty[0] & /*sDates*/ 32) {
    			 sYears = sDates.map(date => date.getFullYear());
    		}

    		if ($$self.$$.dirty[0] & /*x, sDates, y*/ 44) {
    			 $$invalidate(8, areaPath = d3Shape.area().x((d, i) => x(sDates[i])).y0(d => y(d[0])).y1(d => y(d[1])));
    		}

    		if ($$self.$$.dirty[0] & /*areaData, indicatorsUsed*/ 4194306) {
    			 $$invalidate(6, yMax = d3Array.max(areaData, d => indicatorsUsed.reduce(
    				(sum, ind) => {
    					return sum + d[ind];
    				},
    				0
    			)));
    		}

    		if ($$self.$$.dirty[0] & /*yMax*/ 64) {
    			 $$invalidate(9, yValRange = d3Array.range(0, 1.2 * yMax, 1.2 * yMax / 5).map(y => Math.round(y.toFixed() / 10000) * 10000));
    		}

    		if ($$self.$$.dirty[0] & /*areaData*/ 4194304) {
    			 xRev = d3Scale.scaleUtc().domain([margin.left, width - margin.right]).range(d3Array.extent(areaData, d => d.date));
    		}

    		if ($$self.$$.dirty[0] & /*sIndex, x*/ 8388612) {
    			 $$invalidate(14, pointX = sdpt => sIndex > 0
    			? x(sdpt[sIndex].data.date)
    			: x(new Date(2000, 0, 1)));
    		}

    		if ($$self.$$.dirty[0] & /*sIndex, y*/ 8388616) {
    			 $$invalidate(15, pointY = sdpt => sIndex > 0 ? y(sdpt[sIndex][1]) : y(0));
    		}

    		if ($$self.$$.dirty[0] & /*indicatorsUsed, sIndex*/ 8388610) {
    			 $$invalidate(16, getTooltipText = (sData, i) => {
    				const ind = indicatorsUsed[i];
    				const valFixed = sIndex >= 0 ? sData[sIndex].data[ind].toFixed(0) : 0;
    				const valRound = Math.round(valFixed / 100) * 100;

    				const perc = sIndex >= 0
    				? (valFixed / sData[sIndex].data.total * 100).toPrecision(2)
    				: 0;

    				const indNeat = ind.replace("percap", "").replace("prod", "");
    				return `${indNeat}: ${valRound} (${perc}%)`;
    			});
    		}

    		if ($$self.$$.dirty[0] & /*togglePercap*/ 1) {
    			 $$invalidate(24, energyUnit = !togglePercap ? TWH : PC_KWH);
    		}

    		if ($$self.$$.dirty[0] & /*energyUnit, indicatorsUsed*/ 16777218) {
    			 $$invalidate(17, encodeInd = ind => {
    				switch (ind) {
    					case indicatorsUsed[0]:
    						return `Coal ${energyUnit}`;
    					case indicatorsUsed[1]:
    						return `Gas ${energyUnit}`;
    					case indicatorsUsed[2]:
    						return `Oil ${energyUnit}`;
    					case indicatorsUsed[3]:
    						return `Renewable ${energyUnit}`;
    					default:
    						return "";
    				}
    			});
    		}
    	};

    	 $$invalidate(10, year = 1900);
    	 $$invalidate(23, sIndex = 0);
    	 $$invalidate(11, isCursorOnRight = false);
    	 $$invalidate(12, mouseX = 0);
    	 $$invalidate(13, mouseY = 0);

    	return [
    		togglePercap,
    		indicatorsUsed,
    		x,
    		y,
    		seriesData,
    		sDates,
    		yMax,
    		ttVisibility,
    		areaPath,
    		yValRange,
    		year,
    		isCursorOnRight,
    		mouseX,
    		mouseY,
    		pointX,
    		pointY,
    		getTooltipText,
    		encodeInd,
    		margin,
    		handleMouseOver,
    		handleMouseMove,
    		handleMouseOut,
    		areaData,
    		sIndex,
    		energyUnit,
    		input_change_handler
    	];
    }

    class FFRenChart extends internal.SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		internal.init(this, options, instance$3, create_fragment$3, internal.safe_not_equal, {}, [-1, -1]);

    		internal.dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FFRenChart",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    var trendData = [
    	{
    		yr: 1950,
    		cont: "Africa",
    		coalprod: "8.23e-3",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "3.63e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "3.28e-3",
    		sharehh: "6.97e-1",
    		tradeopen: "3.96e-1"
    	},
    	{
    		yr: 1955,
    		cont: "Africa",
    		coalprod: "3.84e-3",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "2.38e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "8.13e-3",
    		sharehh: "6.59e-1",
    		tradeopen: "4.16e-1"
    	},
    	{
    		yr: 1960,
    		cont: "Africa",
    		coalprod: "2.90e-2",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "8.45e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "2.58e-2",
    		sharehh: "5.26e-1",
    		tradeopen: "2.35e-1"
    	},
    	{
    		yr: 1965,
    		cont: "Africa",
    		coalprod: "7.21e-2",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.14e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "5.52e-2",
    		sharehh: "4.33e-1",
    		tradeopen: "2.42e-1"
    	},
    	{
    		yr: 1970,
    		cont: "Africa",
    		coalprod: "5.15e-2",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "4.87e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "1.12e-1",
    		sharehh: "4.20e-1",
    		tradeopen: "2.72e-1"
    	},
    	{
    		yr: 1975,
    		cont: "Africa",
    		coalprod: "2.00e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "2.00e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "1.56e-1",
    		sharehh: "2.76e-1",
    		tradeopen: "4.29e-1"
    	},
    	{
    		yr: 1980,
    		cont: "Africa",
    		coalprod: "7.23e-2",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "6.91e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "9.10e-1",
    		gdp: "1.83e-1",
    		sharehh: "3.25e-1",
    		tradeopen: "3.37e-1"
    	},
    	{
    		yr: 1985,
    		cont: "Africa",
    		coalprod: "2.09e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.33e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "7.88e-1",
    		gdp: "2.28e-1",
    		sharehh: "3.62e-1",
    		tradeopen: "2.36e-1"
    	},
    	{
    		yr: 1990,
    		cont: "Africa",
    		coalprod: "2.43e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "9.51e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "7.47e-1",
    		gdp: "2.39e-1",
    		sharehh: "5.05e-1",
    		tradeopen: "3.88e-1"
    	},
    	{
    		yr: 1995,
    		cont: "Africa",
    		coalprod: "1.59e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.62e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.94e-1",
    		gdp: "2.19e-1",
    		sharehh: "6.69e-1",
    		tradeopen: "4.52e-1"
    	},
    	{
    		yr: 2000,
    		cont: "Africa",
    		coalprod: "2.47e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.06e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.05e-1",
    		gdp: "2.99e-1",
    		sharehh: "5.99e-1",
    		tradeopen: "3.93e-1"
    	},
    	{
    		yr: 2005,
    		cont: "Africa",
    		coalprod: "1.12e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "6.15e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.93e-1",
    		gdp: "5.03e-1",
    		sharehh: "3.97e-1",
    		tradeopen: "5.54e-1"
    	},
    	{
    		yr: 2010,
    		cont: "Africa",
    		coalprod: "4.02e-2",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.10e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "5.64e-1",
    		gdp: "7.73e-1",
    		sharehh: "6.35e-1",
    		tradeopen: "6.01e-1"
    	},
    	{
    		yr: 2015,
    		cont: "Africa",
    		coalprod: "1.13e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "3.17e-2",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "6.15e-1",
    		gdp: "9.53e-1",
    		sharehh: "6.97e-1",
    		tradeopen: "6.41e-1"
    	},
    	{
    		yr: 1955,
    		cont: "Americas",
    		coalprod: "1.75e-1",
    		gasprod: "3.03e-2",
    		oilprod: "1.01e-1",
    		coalprodpc: "2.56e-1",
    		gasprodpc: "1.96e-1",
    		oilprodpc: "8.45e-2",
    		gini: "2.00e-1",
    		gdp: "1.82e-2",
    		sharehh: "7.45e-1",
    		tradeopen: "1.89e-1"
    	},
    	{
    		yr: 1960,
    		cont: "Americas",
    		coalprod: "2.01e-1",
    		gasprod: "6.72e-2",
    		oilprod: "1.75e-1",
    		coalprodpc: "2.33e-1",
    		gasprodpc: "3.89e-1",
    		oilprodpc: "1.39e-1",
    		gini: "2.11e-1",
    		gdp: "3.17e-2",
    		sharehh: "6.62e-1",
    		tradeopen: "2.59e-1"
    	},
    	{
    		yr: 1965,
    		cont: "Americas",
    		coalprod: "2.59e-1",
    		gasprod: "1.32e-1",
    		oilprod: "2.56e-1",
    		coalprodpc: "2.60e-1",
    		gasprodpc: "4.92e-1",
    		oilprodpc: "2.98e-1",
    		gini: "1.68e-1",
    		gdp: "5.87e-2",
    		sharehh: "6.80e-1",
    		tradeopen: "7.11e-2"
    	},
    	{
    		yr: 1970,
    		cont: "Americas",
    		coalprod: "3.63e-1",
    		gasprod: "1.70e-1",
    		oilprod: "3.20e-1",
    		coalprodpc: "3.29e-1",
    		gasprodpc: "4.80e-1",
    		oilprodpc: "3.25e-1",
    		gini: "6.31e-2",
    		gdp: "9.49e-2",
    		sharehh: "6.03e-1",
    		tradeopen: "1.30e-1"
    	},
    	{
    		yr: 1975,
    		cont: "Americas",
    		coalprod: "4.13e-1",
    		gasprod: "2.08e-1",
    		oilprod: "3.39e-1",
    		coalprodpc: "3.73e-1",
    		gasprodpc: "4.12e-1",
    		oilprodpc: "3.62e-1",
    		gini: "1.16e-1",
    		gdp: "1.66e-1",
    		sharehh: "4.68e-1",
    		tradeopen: "3.61e-1"
    	},
    	{
    		yr: 1980,
    		cont: "Americas",
    		coalprod: "2.60e-1",
    		gasprod: "3.02e-1",
    		oilprod: "5.69e-1",
    		coalprodpc: "2.73e-1",
    		gasprodpc: "7.43e-1",
    		oilprodpc: "4.33e-1",
    		gini: "1.31e-1",
    		gdp: "2.23e-1",
    		sharehh: "4.52e-1",
    		tradeopen: "4.10e-1"
    	},
    	{
    		yr: 1985,
    		cont: "Americas",
    		coalprod: "4.25e-1",
    		gasprod: "2.90e-1",
    		oilprod: "6.06e-1",
    		coalprodpc: "4.24e-1",
    		gasprodpc: "7.31e-1",
    		oilprodpc: "4.13e-1",
    		gini: "2.08e-1",
    		gdp: "2.42e-1",
    		sharehh: "3.07e-1",
    		tradeopen: "3.80e-1"
    	},
    	{
    		yr: 1990,
    		cont: "Americas",
    		coalprod: "3.61e-1",
    		gasprod: "4.03e-1",
    		oilprod: "5.61e-1",
    		coalprodpc: "3.05e-1",
    		gasprodpc: "5.66e-1",
    		oilprodpc: "4.42e-1",
    		gini: "2.19e-1",
    		gdp: "2.93e-1",
    		sharehh: "4.95e-1",
    		tradeopen: "3.02e-1"
    	},
    	{
    		yr: 1995,
    		cont: "Americas",
    		coalprod: "3.44e-1",
    		gasprod: "4.82e-1",
    		oilprod: "5.45e-1",
    		coalprodpc: "3.33e-1",
    		gasprodpc: "5.47e-1",
    		oilprodpc: "5.08e-1",
    		gini: "3.49e-1",
    		gdp: "4.18e-1",
    		sharehh: "3.46e-1",
    		tradeopen: "5.09e-1"
    	},
    	{
    		yr: 2000,
    		cont: "Americas",
    		coalprod: "3.91e-1",
    		gasprod: "4.93e-1",
    		oilprod: "4.88e-1",
    		coalprodpc: "3.22e-1",
    		gasprodpc: "5.47e-1",
    		oilprodpc: "5.49e-1",
    		gini: "4.93e-1",
    		gdp: "4.90e-1",
    		sharehh: "3.03e-1",
    		tradeopen: "6.44e-1"
    	},
    	{
    		yr: 2005,
    		cont: "Americas",
    		coalprod: "5.13e-1",
    		gasprod: "5.04e-1",
    		oilprod: "5.31e-1",
    		coalprodpc: "3.12e-1",
    		gasprodpc: "5.99e-1",
    		oilprodpc: "5.30e-1",
    		gini: "4.73e-1",
    		gdp: "5.29e-1",
    		sharehh: "2.95e-1",
    		tradeopen: "8.09e-1"
    	},
    	{
    		yr: 2010,
    		cont: "Americas",
    		coalprod: "5.92e-1",
    		gasprod: "7.17e-1",
    		oilprod: "7.04e-1",
    		coalprodpc: "2.72e-1",
    		gasprodpc: "6.34e-1",
    		oilprodpc: "6.75e-1",
    		gini: "6.70e-1",
    		gdp: "7.82e-1",
    		sharehh: "1.54e-1",
    		tradeopen: "7.70e-1"
    	},
    	{
    		yr: 2015,
    		cont: "Americas",
    		coalprod: "7.13e-1",
    		gasprod: "8.76e-1",
    		oilprod: "7.19e-1",
    		coalprodpc: "2.51e-1",
    		gasprodpc: "6.26e-1",
    		oilprodpc: "8.05e-1",
    		gini: "4.42e-1",
    		gdp: "9.11e-1",
    		sharehh: "1.89e-1",
    		tradeopen: "7.58e-1"
    	},
    	{
    		yr: 1955,
    		cont: "Asia",
    		coalprod: "2.54e-2",
    		gasprod: "6.83e-4",
    		oilprod: "3.70e-2",
    		coalprodpc: "6.94e-2",
    		gasprodpc: "6.93e-2",
    		oilprodpc: "1.61e-3",
    		gini: "4.06e-1",
    		gdp: "4.48e-3",
    		sharehh: "9.01e-1",
    		tradeopen: "9.16e-2"
    	},
    	{
    		yr: 1960,
    		cont: "Asia",
    		coalprod: "6.36e-2",
    		gasprod: "3.41e-3",
    		oilprod: "6.99e-2",
    		coalprodpc: "1.70e-1",
    		gasprodpc: "1.28e-1",
    		oilprodpc: "9.33e-3",
    		gini: "3.89e-1",
    		gdp: "9.71e-3",
    		sharehh: "7.23e-1",
    		tradeopen: "9.50e-2"
    	},
    	{
    		yr: 1965,
    		cont: "Asia",
    		coalprod: "7.73e-2",
    		gasprod: "9.80e-3",
    		oilprod: "2.86e-1",
    		coalprodpc: "1.52e-1",
    		gasprodpc: "3.42e-1",
    		oilprodpc: "2.42e-2",
    		gini: "3.75e-1",
    		gdp: "2.24e-2",
    		sharehh: "6.99e-1",
    		tradeopen: "1.38e-1"
    	},
    	{
    		yr: 1970,
    		cont: "Asia",
    		coalprod: "7.33e-2",
    		gasprod: "1.47e-2",
    		oilprod: "4.49e-1",
    		coalprodpc: "1.42e-1",
    		gasprodpc: "3.69e-1",
    		oilprodpc: "3.10e-2",
    		gini: "3.81e-1",
    		gdp: "3.66e-2",
    		sharehh: "5.87e-1",
    		tradeopen: "9.18e-2"
    	},
    	{
    		yr: 1975,
    		cont: "Asia",
    		coalprod: "1.22e-1",
    		gasprod: "4.60e-2",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.86e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "7.14e-2",
    		gini: "3.67e-1",
    		gdp: "6.35e-2",
    		sharehh: "4.23e-1",
    		tradeopen: "1.21e-1"
    	},
    	{
    		yr: 1980,
    		cont: "Asia",
    		coalprod: "1.33e-1",
    		gasprod: "1.19e-1",
    		oilprod: "4.97e-1",
    		coalprodpc: "2.17e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "2.30e-1",
    		gini: "7.02e-1",
    		gdp: "7.66e-2",
    		sharehh: "4.92e-1",
    		tradeopen: "2.91e-1"
    	},
    	{
    		yr: 1985,
    		cont: "Asia",
    		coalprod: "2.28e-1",
    		gasprod: "9.69e-2",
    		oilprod: "5.00e-1",
    		coalprodpc: "2.53e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "2.72e-1",
    		gini: "2.78e-1",
    		gdp: "9.94e-2",
    		sharehh: "3.74e-1",
    		tradeopen: "2.13e-1"
    	},
    	{
    		yr: 1990,
    		cont: "Asia",
    		coalprod: "1.25e-1",
    		gasprod: "2.44e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.85e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "4.66e-1",
    		gini: "6.25e-1",
    		gdp: "1.91e-1",
    		sharehh: "4.10e-1",
    		tradeopen: "3.35e-1"
    	},
    	{
    		yr: 1995,
    		cont: "Asia",
    		coalprod: "1.55e-1",
    		gasprod: "3.66e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.63e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "4.46e-1",
    		gini: "8.07e-1",
    		gdp: "2.23e-1",
    		sharehh: "3.14e-1",
    		tradeopen: "4.99e-1"
    	},
    	{
    		yr: 2000,
    		cont: "Asia",
    		coalprod: "1.38e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.45e-1",
    		coalprodpc: "1.54e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "6.68e-1",
    		gdp: "2.60e-1",
    		sharehh: "3.96e-1",
    		tradeopen: "6.11e-1"
    	},
    	{
    		yr: 2005,
    		cont: "Asia",
    		coalprod: "2.64e-1",
    		gasprod: "5.07e-1",
    		oilprod: "6.33e-1",
    		coalprodpc: "3.05e-1",
    		gasprodpc: "5.91e-1",
    		oilprodpc: "5.92e-1",
    		gini: "8.13e-1",
    		gdp: "4.06e-1",
    		sharehh: "4.65e-1",
    		tradeopen: "7.13e-1"
    	},
    	{
    		yr: 2010,
    		cont: "Asia",
    		coalprod: "5.37e-1",
    		gasprod: "6.53e-1",
    		oilprod: "6.04e-1",
    		coalprodpc: "5.22e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "6.57e-1",
    		gini: "7.32e-1",
    		gdp: "6.61e-1",
    		sharehh: "4.05e-1",
    		tradeopen: "6.35e-1"
    	},
    	{
    		yr: 2015,
    		cont: "Asia",
    		coalprod: "7.06e-1",
    		gasprod: "6.64e-1",
    		oilprod: "5.73e-1",
    		coalprodpc: "6.17e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.94e-1",
    		gini: "3.67e-1",
    		gdp: "8.54e-1",
    		sharehh: "4.83e-1",
    		tradeopen: "6.22e-1"
    	},
    	{
    		yr: 1955,
    		cont: "Europe",
    		coalprod: "4.45e-1",
    		gasprod: "3.72e-2",
    		oilprod: "1.96e-1",
    		coalprodpc: "5.01e-1",
    		gasprodpc: "2.60e-1",
    		oilprodpc: "5.81e-2",
    		gini: "0.00e+0",
    		gdp: "3.08e-2",
    		sharehh: "7.81e-1",
    		tradeopen: "1.01e-1"
    	},
    	{
    		yr: 1960,
    		cont: "Europe",
    		coalprod: "5.99e-1",
    		gasprod: "5.82e-2",
    		oilprod: "3.58e-1",
    		coalprodpc: "5.95e-1",
    		gasprodpc: "4.12e-1",
    		oilprodpc: "6.69e-2",
    		gini: "0.00e+0",
    		gdp: "6.48e-2",
    		sharehh: "6.95e-1",
    		tradeopen: "1.48e-1"
    	},
    	{
    		yr: 1965,
    		cont: "Europe",
    		coalprod: "6.51e-1",
    		gasprod: "1.62e-1",
    		oilprod: "4.39e-1",
    		coalprodpc: "5.66e-1",
    		gasprodpc: "4.83e-1",
    		oilprodpc: "1.76e-1",
    		gini: "0.00e+0",
    		gdp: "1.19e-1",
    		sharehh: "4.63e-1",
    		tradeopen: "1.51e-1"
    	},
    	{
    		yr: 1970,
    		cont: "Europe",
    		coalprod: "4.16e-1",
    		gasprod: "4.77e-1",
    		oilprod: "3.39e-1",
    		coalprodpc: "4.20e-1",
    		gasprodpc: "4.14e-1",
    		oilprodpc: "4.68e-1",
    		gini: "0.00e+0",
    		gdp: "1.69e-1",
    		sharehh: "3.08e-1",
    		tradeopen: "2.04e-1"
    	},
    	{
    		yr: 1975,
    		cont: "Europe",
    		coalprod: "3.17e-1",
    		gasprod: "4.85e-1",
    		oilprod: "2.57e-1",
    		coalprodpc: "3.36e-1",
    		gasprodpc: "2.66e-1",
    		oilprodpc: "5.00e-1",
    		gini: "0.00e+0",
    		gdp: "2.29e-1",
    		sharehh: "4.25e-1",
    		tradeopen: "2.74e-1"
    	},
    	{
    		yr: 1980,
    		cont: "Europe",
    		coalprod: "3.43e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "2.82e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.28e-1",
    		gdp: "2.93e-1",
    		sharehh: "4.71e-1",
    		tradeopen: "4.02e-1"
    	},
    	{
    		yr: 1985,
    		cont: "Europe",
    		coalprod: "4.42e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "3.94e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.55e-1",
    		gdp: "2.97e-1",
    		sharehh: "3.53e-1",
    		tradeopen: "4.75e-1"
    	},
    	{
    		yr: 1990,
    		cont: "Europe",
    		coalprod: "3.24e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "2.60e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.63e-1",
    		gdp: "4.16e-1",
    		sharehh: "5.03e-1",
    		tradeopen: "4.15e-1"
    	},
    	{
    		yr: 1995,
    		cont: "Europe",
    		coalprod: "1.56e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.36e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.70e-1",
    		gdp: "4.30e-1",
    		sharehh: "4.00e-1",
    		tradeopen: "4.21e-1"
    	},
    	{
    		yr: 2000,
    		cont: "Europe",
    		coalprod: "2.02e-1",
    		gasprod: "5.00e-1",
    		oilprod: "5.00e-1",
    		coalprodpc: "1.97e-1",
    		gasprodpc: "5.00e-1",
    		oilprodpc: "5.00e-1",
    		gini: "8.58e-1",
    		gdp: "5.25e-1",
    		sharehh: "4.15e-1",
    		tradeopen: "6.42e-1"
    	},
    	{
    		yr: 2005,
    		cont: "Europe",
    		coalprod: "1.60e-1",
    		gasprod: "5.00e-1",
    		oilprod: "4.76e-1",
    		coalprodpc: "1.50e-1",
    		gasprodpc: "4.64e-1",
    		oilprodpc: "5.00e-1",
    		gini: "9.21e-1",
    		gdp: "7.01e-1",
    		sharehh: "4.01e-1",
    		tradeopen: "6.54e-1"
    	},
    	{
    		yr: 2010,
    		cont: "Europe",
    		coalprod: "1.50e-1",
    		gasprod: "5.00e-1",
    		oilprod: "3.74e-1",
    		coalprodpc: "1.40e-1",
    		gasprodpc: "3.96e-1",
    		oilprodpc: "5.00e-1",
    		gini: "9.19e-1",
    		gdp: "8.50e-1",
    		sharehh: "4.40e-1",
    		tradeopen: "7.33e-1"
    	},
    	{
    		yr: 2015,
    		cont: "Europe",
    		coalprod: "6.35e-2",
    		gasprod: "3.65e-1",
    		oilprod: "3.34e-1",
    		coalprodpc: "5.74e-2",
    		gasprodpc: "3.21e-1",
    		oilprodpc: "3.52e-1",
    		gini: "9.23e-1",
    		gdp: "9.12e-1",
    		sharehh: "2.35e-1",
    		tradeopen: "9.31e-1"
    	},
    	{
    		yr: 1950,
    		cont: "Oceania",
    		coalprod: "1.44e-1",
    		gasprod: "2.50e-1",
    		oilprod: "2.50e-1",
    		coalprodpc: "2.38e-1",
    		gasprodpc: "2.50e-1",
    		oilprodpc: "2.50e-1",
    		gini: "6.31e-1",
    		gdp: "7.19e-3",
    		sharehh: "6.32e-1",
    		tradeopen: "6.72e-1"
    	},
    	{
    		yr: 1955,
    		cont: "Oceania",
    		coalprod: "1.40e-1",
    		gasprod: "2.50e-1",
    		oilprod: "2.50e-1",
    		coalprodpc: "1.85e-1",
    		gasprodpc: "2.50e-1",
    		oilprodpc: "2.50e-1",
    		gini: "3.55e-1",
    		gdp: "2.57e-2",
    		sharehh: "6.23e-1",
    		tradeopen: "3.52e-1"
    	},
    	{
    		yr: 1960,
    		cont: "Oceania",
    		coalprod: "1.89e-1",
    		gasprod: "2.50e-1",
    		oilprod: "2.50e-1",
    		coalprodpc: "2.17e-1",
    		gasprodpc: "2.50e-1",
    		oilprodpc: "2.50e-1",
    		gini: "4.25e-1",
    		gdp: "5.91e-2",
    		sharehh: "6.23e-1",
    		tradeopen: "1.68e-1"
    	},
    	{
    		yr: 1965,
    		cont: "Oceania",
    		coalprod: "1.68e-1",
    		gasprod: "2.50e-1",
    		oilprod: "2.55e-1",
    		coalprodpc: "1.54e-1",
    		gasprodpc: "2.58e-1",
    		oilprodpc: "2.50e-1",
    		gini: "4.04e-1",
    		gdp: "1.02e-1",
    		sharehh: "5.83e-1",
    		tradeopen: "1.59e-1"
    	},
    	{
    		yr: 1970,
    		cont: "Oceania",
    		coalprod: "1.58e-1",
    		gasprod: "2.56e-1",
    		oilprod: "3.67e-1",
    		coalprodpc: "1.24e-1",
    		gasprodpc: "4.24e-1",
    		oilprodpc: "2.62e-1",
    		gini: "3.47e-1",
    		gdp: "1.41e-1",
    		sharehh: "3.93e-1",
    		tradeopen: "1.55e-1"
    	},
    	{
    		yr: 1975,
    		cont: "Oceania",
    		coalprod: "1.98e-1",
    		gasprod: "2.70e-1",
    		oilprod: "5.41e-1",
    		coalprodpc: "1.48e-1",
    		gasprodpc: "6.51e-1",
    		oilprodpc: "2.87e-1",
    		gini: "2.27e-1",
    		gdp: "1.82e-1",
    		sharehh: "4.54e-1",
    		tradeopen: "2.75e-1"
    	},
    	{
    		yr: 1980,
    		cont: "Oceania",
    		coalprod: "2.10e-1",
    		gasprod: "2.89e-1",
    		oilprod: "5.44e-1",
    		coalprodpc: "1.72e-1",
    		gasprodpc: "6.32e-1",
    		oilprodpc: "3.17e-1",
    		gini: "2.16e-1",
    		gdp: "2.03e-1",
    		sharehh: "3.81e-1",
    		tradeopen: "4.93e-1"
    	},
    	{
    		yr: 1985,
    		cont: "Oceania",
    		coalprod: "2.68e-1",
    		gasprod: "2.97e-1",
    		oilprod: "6.64e-1",
    		coalprodpc: "2.42e-1",
    		gasprodpc: "7.50e-1",
    		oilprodpc: "3.25e-1",
    		gini: "2.37e-1",
    		gdp: "2.47e-1",
    		sharehh: "2.81e-1",
    		tradeopen: "5.46e-1"
    	},
    	{
    		yr: 1990,
    		cont: "Oceania",
    		coalprod: "3.24e-1",
    		gasprod: "3.22e-1",
    		oilprod: "6.58e-1",
    		coalprodpc: "2.89e-1",
    		gasprodpc: "7.06e-1",
    		oilprodpc: "3.57e-1",
    		gini: "3.36e-1",
    		gdp: "3.20e-1",
    		sharehh: "3.91e-1",
    		tradeopen: "4.03e-1"
    	},
    	{
    		yr: 1995,
    		cont: "Oceania",
    		coalprod: "4.91e-1",
    		gasprod: "3.53e-1",
    		oilprod: "6.09e-1",
    		coalprodpc: "4.26e-1",
    		gasprodpc: "6.28e-1",
    		oilprodpc: "3.95e-1",
    		gini: "3.97e-1",
    		gdp: "4.05e-1",
    		sharehh: "3.84e-1",
    		tradeopen: "6.19e-1"
    	},
    	{
    		yr: 2000,
    		cont: "Oceania",
    		coalprod: "5.31e-1",
    		gasprod: "3.59e-1",
    		oilprod: "7.50e-1",
    		coalprodpc: "4.54e-1",
    		gasprodpc: "7.49e-1",
    		oilprodpc: "3.95e-1",
    		gini: "3.64e-1",
    		gdp: "5.16e-1",
    		sharehh: "4.29e-1",
    		tradeopen: "9.53e-1"
    	},
    	{
    		yr: 2005,
    		cont: "Oceania",
    		coalprod: "7.96e-1",
    		gasprod: "3.84e-1",
    		oilprod: "5.91e-1",
    		coalprodpc: "6.58e-1",
    		gasprodpc: "5.70e-1",
    		oilprodpc: "4.17e-1",
    		gini: "3.59e-1",
    		gdp: "6.34e-1",
    		sharehh: "3.18e-1",
    		tradeopen: "7.15e-1"
    	},
    	{
    		yr: 2010,
    		cont: "Oceania",
    		coalprod: "8.51e-1",
    		gasprod: "4.34e-1",
    		oilprod: "5.82e-1",
    		coalprodpc: "6.58e-1",
    		gasprodpc: "5.34e-1",
    		oilprodpc: "4.59e-1",
    		gini: "3.26e-1",
    		gdp: "7.70e-1",
    		sharehh: "2.72e-1",
    		tradeopen: "7.25e-1"
    	},
    	{
    		yr: 2015,
    		cont: "Oceania",
    		coalprod: "7.22e-1",
    		gasprod: "5.09e-1",
    		oilprod: "4.79e-1",
    		coalprodpc: "5.37e-1",
    		gasprodpc: "4.31e-1",
    		oilprodpc: "5.23e-1",
    		gini: "4.30e-1",
    		gdp: "8.43e-1",
    		sharehh: "3.85e-1",
    		tradeopen: "6.42e-1"
    	},
    	{
    		yr: 1900,
    		cont: "World",
    		coalprod: "8.66e-3",
    		gasprod: "1.50e-1",
    		oilprod: "1.50e-1",
    		coalprodpc: "9.97e-2",
    		gasprodpc: "1.50e-1",
    		oilprodpc: "1.50e-1",
    		gini: "0.00e+0",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1905,
    		cont: "World",
    		coalprod: "2.53e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.50e-1",
    		coalprodpc: "1.43e-1",
    		gasprodpc: "1.50e-1",
    		oilprodpc: "1.50e-1",
    		gini: "0.00e+0",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1910,
    		cont: "World",
    		coalprod: "6.21e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.50e-1",
    		coalprodpc: "2.65e-1",
    		gasprodpc: "1.50e-1",
    		oilprodpc: "1.50e-1",
    		gini: "0.00e+0",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1915,
    		cont: "World",
    		coalprod: "6.85e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.50e-1",
    		coalprodpc: "2.18e-1",
    		gasprodpc: "1.51e-1",
    		oilprodpc: "1.50e-1",
    		gini: "2.65e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1920,
    		cont: "World",
    		coalprod: "6.60e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.51e-1",
    		coalprodpc: "1.84e-1",
    		gasprodpc: "1.52e-1",
    		oilprodpc: "1.50e-1",
    		gini: "2.47e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1925,
    		cont: "World",
    		coalprod: "6.31e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.52e-1",
    		coalprodpc: "1.67e-1",
    		gasprodpc: "1.59e-1",
    		oilprodpc: "1.50e-1",
    		gini: "2.92e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1930,
    		cont: "World",
    		coalprod: "7.09e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.56e-1",
    		coalprodpc: "1.77e-1",
    		gasprodpc: "1.75e-1",
    		oilprodpc: "1.50e-1",
    		gini: "2.94e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1935,
    		cont: "World",
    		coalprod: "7.17e-2",
    		gasprod: "1.50e-1",
    		oilprod: "1.58e-1",
    		coalprodpc: "1.39e-1",
    		gasprodpc: "1.79e-1",
    		oilprodpc: "1.50e-1",
    		gini: "3.23e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1940,
    		cont: "World",
    		coalprod: "1.24e-1",
    		gasprod: "1.52e-1",
    		oilprod: "1.62e-1",
    		coalprodpc: "1.97e-1",
    		gasprodpc: "1.86e-1",
    		oilprodpc: "1.55e-1",
    		gini: "2.38e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1945,
    		cont: "World",
    		coalprod: "1.10e-1",
    		gasprod: "1.52e-1",
    		oilprod: "1.60e-1",
    		coalprodpc: "1.80e-1",
    		gasprodpc: "1.81e-1",
    		oilprodpc: "1.56e-1",
    		gini: "1.02e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	},
    	{
    		yr: 1950,
    		cont: "World",
    		coalprod: "1.40e-1",
    		gasprod: "1.58e-1",
    		oilprod: "1.75e-1",
    		coalprodpc: "2.15e-1",
    		gasprodpc: "2.00e-1",
    		oilprodpc: "1.70e-1",
    		gini: "1.54e-1",
    		gdp: "2.09e-3",
    		sharehh: "8.09e-1",
    		tradeopen: "2.73e-1"
    	},
    	{
    		yr: 1955,
    		cont: "World",
    		coalprod: "1.58e-1",
    		gasprod: "1.64e-1",
    		oilprod: "2.17e-1",
    		coalprodpc: "2.07e-1",
    		gasprodpc: "2.55e-1",
    		oilprodpc: "1.79e-1",
    		gini: "1.92e-1",
    		gdp: "1.75e-2",
    		sharehh: "7.42e-1",
    		tradeopen: "2.30e-1"
    	},
    	{
    		yr: 1960,
    		cont: "World",
    		coalprod: "2.16e-1",
    		gasprod: "1.76e-1",
    		oilprod: "2.71e-1",
    		coalprodpc: "2.60e-1",
    		gasprodpc: "3.36e-1",
    		oilprodpc: "1.93e-1",
    		gini: "2.05e-1",
    		gdp: "3.82e-2",
    		sharehh: "6.46e-1",
    		tradeopen: "1.81e-1"
    	},
    	{
    		yr: 1965,
    		cont: "World",
    		coalprod: "2.45e-1",
    		gasprod: "2.11e-1",
    		oilprod: "3.47e-1",
    		coalprodpc: "2.49e-1",
    		gasprodpc: "4.15e-1",
    		oilprodpc: "2.50e-1",
    		gini: "1.89e-1",
    		gdp: "7.13e-2",
    		sharehh: "5.72e-1",
    		tradeopen: "1.52e-1"
    	},
    	{
    		yr: 1970,
    		cont: "World",
    		coalprod: "2.12e-1",
    		gasprod: "2.84e-1",
    		oilprod: "3.95e-1",
    		coalprodpc: "2.13e-1",
    		gasprodpc: "4.37e-1",
    		oilprodpc: "3.17e-1",
    		gini: "1.58e-1",
    		gdp: "1.11e-1",
    		sharehh: "4.62e-1",
    		tradeopen: "1.71e-1"
    	},
    	{
    		yr: 1975,
    		cont: "World",
    		coalprod: "2.50e-1",
    		gasprod: "3.02e-1",
    		oilprod: "4.28e-1",
    		coalprodpc: "2.49e-1",
    		gasprodpc: "4.66e-1",
    		oilprodpc: "3.44e-1",
    		gini: "1.42e-1",
    		gdp: "1.59e-1",
    		sharehh: "4.09e-1",
    		tradeopen: "2.92e-1"
    	},
    	{
    		yr: 1980,
    		cont: "World",
    		coalprod: "2.04e-1",
    		gasprod: "3.42e-1",
    		oilprod: "5.22e-1",
    		coalprodpc: "2.03e-1",
    		gasprodpc: "5.75e-1",
    		oilprodpc: "3.96e-1",
    		gini: "5.57e-1",
    		gdp: "1.96e-1",
    		sharehh: "4.24e-1",
    		tradeopen: "3.86e-1"
    	},
    	{
    		yr: 1985,
    		cont: "World",
    		coalprod: "3.14e-1",
    		gasprod: "3.37e-1",
    		oilprod: "5.54e-1",
    		coalprodpc: "2.89e-1",
    		gasprodpc: "5.96e-1",
    		oilprodpc: "4.02e-1",
    		gini: "4.73e-1",
    		gdp: "2.23e-1",
    		sharehh: "3.35e-1",
    		tradeopen: "3.70e-1"
    	},
    	{
    		yr: 1990,
    		cont: "World",
    		coalprod: "2.75e-1",
    		gasprod: "3.94e-1",
    		oilprod: "5.44e-1",
    		coalprodpc: "2.27e-1",
    		gasprodpc: "5.54e-1",
    		oilprodpc: "4.53e-1",
    		gini: "5.58e-1",
    		gdp: "2.92e-1",
    		sharehh: "4.61e-1",
    		tradeopen: "3.68e-1"
    	},
    	{
    		yr: 1995,
    		cont: "World",
    		coalprod: "2.61e-1",
    		gasprod: "4.40e-1",
    		oilprod: "5.31e-1",
    		coalprodpc: "2.44e-1",
    		gasprodpc: "5.35e-1",
    		oilprodpc: "4.70e-1",
    		gini: "6.63e-1",
    		gdp: "3.39e-1",
    		sharehh: "4.23e-1",
    		tradeopen: "5.00e-1"
    	},
    	{
    		yr: 2000,
    		cont: "World",
    		coalprod: "3.02e-1",
    		gasprod: "4.70e-1",
    		oilprod: "5.57e-1",
    		coalprodpc: "2.47e-1",
    		gasprodpc: "5.59e-1",
    		oilprodpc: "4.89e-1",
    		gini: "6.38e-1",
    		gdp: "4.18e-1",
    		sharehh: "4.28e-1",
    		tradeopen: "6.49e-1"
    	},
    	{
    		yr: 2005,
    		cont: "World",
    		coalprod: "3.69e-1",
    		gasprod: "4.79e-1",
    		oilprod: "5.46e-1",
    		coalprodpc: "2.97e-1",
    		gasprodpc: "5.45e-1",
    		oilprodpc: "5.08e-1",
    		gini: "6.92e-1",
    		gdp: "5.55e-1",
    		sharehh: "3.75e-1",
    		tradeopen: "6.89e-1"
    	},
    	{
    		yr: 2010,
    		cont: "World",
    		coalprod: "4.34e-1",
    		gasprod: "5.61e-1",
    		oilprod: "5.53e-1",
    		coalprodpc: "3.21e-1",
    		gasprodpc: "5.13e-1",
    		oilprodpc: "5.58e-1",
    		gini: "6.42e-1",
    		gdp: "7.67e-1",
    		sharehh: "3.81e-1",
    		tradeopen: "6.93e-1"
    	},
    	{
    		yr: 2015,
    		cont: "World",
    		coalprod: "4.63e-1",
    		gasprod: "5.83e-1",
    		oilprod: "5.21e-1",
    		coalprodpc: "2.99e-1",
    		gasprodpc: "4.76e-1",
    		oilprodpc: "5.55e-1",
    		gini: "5.55e-1",
    		gdp: "8.95e-1",
    		sharehh: "3.98e-1",
    		tradeopen: "7.19e-1"
    	},
    	{
    		yr: 2020,
    		cont: "World",
    		coalprod: "3.19e-1",
    		gasprod: "7.10e-1",
    		oilprod: "4.79e-1",
    		coalprodpc: "2.06e-1",
    		gasprodpc: "3.37e-1",
    		oilprodpc: "6.35e-1",
    		gini: "8.92e-1",
    		gdp: "NaN",
    		sharehh: "NaN",
    		tradeopen: "NaN"
    	}
    ];

    /* src\components\TrendLinesChart.svelte generated by Svelte v3.31.0 */

    const { Object: Object_1$1 } = internal.globals;
    const file$4 = "src\\components\\TrendLinesChart.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_3$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	return child_ctx;
    }

    function get_each_context_4$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	child_ctx[37] = i;
    	return child_ctx;
    }

    function get_each_context_5$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[38] = list[i];
    	return child_ctx;
    }

    function get_each_context_6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	child_ctx[37] = i;
    	return child_ctx;
    }

    function get_each_context_7(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[42] = list[i];
    	return child_ctx;
    }

    // (102:12) {#each selectFFInds as selectFF}
    function create_each_block_7(ctx) {
    	let label;
    	let input;
    	let input_value_value;
    	let t0;
    	let t1_value = /*encodeInd*/ ctx[7](/*selectFF*/ ctx[42]) + "";
    	let t1;
    	let t2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			label = internal.element("label");
    			input = internal.element("input");
    			t0 = internal.space();
    			t1 = internal.text(t1_value);
    			t2 = internal.space();
    			internal.attr_dev(input, "type", "radio");
    			internal.attr_dev(input, "name", "ffInds");
    			input.__value = input_value_value = /*selectFF*/ ctx[42];
    			input.value = input.__value;
    			/*$$binding_groups*/ ctx[20][0].push(input);
    			internal.add_location(input, file$4, 103, 20, 3992);
    			internal.attr_dev(label, "class", "svelte-13ibwyj");
    			internal.add_location(label, file$4, 102, 16, 3963);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, label, anchor);
    			internal.append_dev(label, input);
    			input.checked = input.__value === /*selectFFValue*/ ctx[1];
    			internal.append_dev(label, t0);
    			internal.append_dev(label, t1);
    			internal.append_dev(label, t2);

    			if (!mounted) {
    				dispose = internal.listen_dev(input, "change", /*input_change_handler_1*/ ctx[19]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*selectFFInds*/ 4 && input_value_value !== (input_value_value = /*selectFF*/ ctx[42])) {
    				internal.prop_dev(input, "__value", input_value_value);
    				input.value = input.__value;
    			}

    			if (dirty[0] & /*selectFFValue*/ 2) {
    				input.checked = input.__value === /*selectFFValue*/ ctx[1];
    			}

    			if (dirty[0] & /*encodeInd, selectFFInds*/ 132 && t1_value !== (t1_value = /*encodeInd*/ ctx[7](/*selectFF*/ ctx[42]) + "")) internal.set_data_dev(t1, t1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(label);
    			/*$$binding_groups*/ ctx[20][0].splice(/*$$binding_groups*/ ctx[20][0].indexOf(input), 1);
    			mounted = false;
    			dispose();
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_7.name,
    		type: "each",
    		source: "(102:12) {#each selectFFInds as selectFF}",
    		ctx
    	});

    	return block;
    }

    // (111:8) {#each continents as conti, i}
    function create_each_block_6(ctx) {
    	let div1;
    	let div0;
    	let div0_style_value;
    	let t0;
    	let span;
    	let t1_value = /*conti*/ ctx[35] + "";
    	let t1;
    	let t2;

    	const block = {
    		c: function create() {
    			div1 = internal.element("div");
    			div0 = internal.element("div");
    			t0 = internal.space();
    			span = internal.element("span");
    			t1 = internal.text(t1_value);
    			t2 = internal.space();
    			internal.attr_dev(div0, "class", "legend-color svelte-13ibwyj");
    			internal.attr_dev(div0, "style", div0_style_value = `background-color: ${d3ScaleChromatic.schemeCategory10[/*i*/ ctx[37]]};`);
    			internal.add_location(div0, file$4, 112, 16, 4317);
    			internal.attr_dev(span, "class", "");
    			internal.add_location(span, file$4, 113, 16, 4419);
    			internal.attr_dev(div1, "class", "legend-container svelte-13ibwyj");
    			internal.add_location(div1, file$4, 111, 12, 4269);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, div1, anchor);
    			internal.append_dev(div1, div0);
    			internal.append_dev(div1, t0);
    			internal.append_dev(div1, span);
    			internal.append_dev(span, t1);
    			internal.append_dev(div1, t2);
    		},
    		p: internal.noop,
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(div1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_6.name,
    		type: "each",
    		source: "(111:8) {#each continents as conti, i}",
    		ctx
    	});

    	return block;
    }

    // (136:20) {#each markersData(conti) as mData}
    function create_each_block_5$1(ctx) {
    	let g0;
    	let circle;
    	let circle_cx_value;
    	let circle_cy_value;
    	let circle_r_value;
    	let circle_fill_value;
    	let g1;
    	let text_1;
    	let t_value = /*mData*/ ctx[38]["date"].getFullYear() + "";
    	let t;
    	let text_1_x_value;
    	let text_1_y_value;
    	let text_1_fill_value;

    	const block = {
    		c: function create() {
    			g0 = internal.svg_element("g");
    			circle = internal.svg_element("circle");
    			g1 = internal.svg_element("g");
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(circle, "cx", circle_cx_value = /*xScaleLines*/ ctx[10](/*mData*/ ctx[38][/*selectFFValue*/ ctx[1]]));
    			internal.attr_dev(circle, "cy", circle_cy_value = /*yScaleLines*/ ctx[11](/*mData*/ ctx[38][SEL_ECON_IND]));
    			internal.attr_dev(circle, "r", circle_r_value = /*conti*/ ctx[35] === "World" ? 4 : 2);
    			internal.attr_dev(circle, "fill", circle_fill_value = d3ScaleChromatic.schemeCategory10[/*i*/ ctx[37]]);
    			internal.attr_dev(circle, "stroke", "none");
    			internal.add_location(circle, file$4, 137, 28, 5254);
    			internal.attr_dev(g0, "class", "dots-group");
    			internal.add_location(g0, file$4, 136, 24, 5202);
    			internal.attr_dev(text_1, "x", text_1_x_value = /*xScaleLines*/ ctx[10](/*mData*/ ctx[38][/*selectFFValue*/ ctx[1]]));
    			internal.attr_dev(text_1, "y", text_1_y_value = /*yScaleLines*/ ctx[11](/*mData*/ ctx[38][SEL_ECON_IND]));
    			internal.attr_dev(text_1, "fill", text_1_fill_value = d3ScaleChromatic.schemeCategory10[/*i*/ ctx[37]]);
    			internal.attr_dev(text_1, "font-size", "12");
    			internal.add_location(text_1, file$4, 146, 28, 5721);
    			internal.attr_dev(g1, "class", "year-labels-group");
    			internal.add_location(g1, file$4, 145, 24, 5662);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g0, anchor);
    			internal.append_dev(g0, circle);
    			internal.insert_dev(target, g1, anchor);
    			internal.append_dev(g1, text_1);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*markersData, selectFFValue*/ 18 && circle_cx_value !== (circle_cx_value = /*xScaleLines*/ ctx[10](/*mData*/ ctx[38][/*selectFFValue*/ ctx[1]]))) {
    				internal.attr_dev(circle, "cx", circle_cx_value);
    			}

    			if (dirty[0] & /*markersData*/ 16 && circle_cy_value !== (circle_cy_value = /*yScaleLines*/ ctx[11](/*mData*/ ctx[38][SEL_ECON_IND]))) {
    				internal.attr_dev(circle, "cy", circle_cy_value);
    			}

    			if (dirty[0] & /*markersData*/ 16 && t_value !== (t_value = /*mData*/ ctx[38]["date"].getFullYear() + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*markersData, selectFFValue*/ 18 && text_1_x_value !== (text_1_x_value = /*xScaleLines*/ ctx[10](/*mData*/ ctx[38][/*selectFFValue*/ ctx[1]]))) {
    				internal.attr_dev(text_1, "x", text_1_x_value);
    			}

    			if (dirty[0] & /*markersData*/ 16 && text_1_y_value !== (text_1_y_value = /*yScaleLines*/ ctx[11](/*mData*/ ctx[38][SEL_ECON_IND]))) {
    				internal.attr_dev(text_1, "y", text_1_y_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g0);
    			if (detaching) internal.detach_dev(g1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_5$1.name,
    		type: "each",
    		source: "(136:20) {#each markersData(conti) as mData}",
    		ctx
    	});

    	return block;
    }

    // (125:12) {#each continents as conti, i}
    function create_each_block_4$1(ctx) {
    	let g0;
    	let path;
    	let path_d_value;
    	let path_stroke_value;
    	let path_stroke_width_value;
    	let g1;
    	let each_value_5 = /*markersData*/ ctx[4](/*conti*/ ctx[35]);
    	internal.validate_each_argument(each_value_5);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_5.length; i += 1) {
    		each_blocks[i] = create_each_block_5$1(get_each_context_5$1(ctx, each_value_5, i));
    	}

    	const block = {
    		c: function create() {
    			g0 = internal.svg_element("g");
    			path = internal.svg_element("path");
    			g1 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			internal.attr_dev(path, "class", "conti-path");
    			internal.attr_dev(path, "d", path_d_value = /*contiLinePath*/ ctx[3](/*conti*/ ctx[35]));
    			internal.attr_dev(path, "stroke", path_stroke_value = d3ScaleChromatic.schemeCategory10[/*i*/ ctx[37]]);
    			internal.attr_dev(path, "fill", "none");
    			internal.attr_dev(path, "stroke-width", path_stroke_width_value = /*conti*/ ctx[35] === "World" ? 3 : 1.5);
    			internal.add_location(path, file$4, 126, 20, 4772);
    			internal.attr_dev(g0, "class", "paths-group");
    			internal.add_location(g0, file$4, 125, 16, 4727);
    			internal.attr_dev(g1, "class", "markers-group");
    			internal.add_location(g1, file$4, 134, 16, 5094);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g0, anchor);
    			internal.append_dev(g0, path);
    			internal.insert_dev(target, g1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g1, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*contiLinePath*/ 8 && path_d_value !== (path_d_value = /*contiLinePath*/ ctx[3](/*conti*/ ctx[35]))) {
    				internal.attr_dev(path, "d", path_d_value);
    			}

    			if (dirty[0] & /*xScaleLines, markersData, continents, selectFFValue, yScaleLines*/ 3602) {
    				each_value_5 = /*markersData*/ ctx[4](/*conti*/ ctx[35]);
    				internal.validate_each_argument(each_value_5);
    				let i;

    				for (i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5$1(ctx, each_value_5, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_5$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_5.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g0);
    			if (detaching) internal.detach_dev(g1);
    			internal.destroy_each(each_blocks, detaching);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_4$1.name,
    		type: "each",
    		source: "(125:12) {#each continents as conti, i}",
    		ctx
    	});

    	return block;
    }

    // (171:16) {#each xValRange as xVal}
    function create_each_block_3$1(ctx) {
    	let text_1;
    	let t_value = /*xVal*/ ctx[25] + "";
    	let t;
    	let text_1_x_value;
    	let text_1_y_value;

    	const block = {
    		c: function create() {
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(text_1, "x", text_1_x_value = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]));
    			internal.attr_dev(text_1, "y", text_1_y_value = height$1 - /*margin*/ ctx[8].bottom);
    			internal.attr_dev(text_1, "dy", "18");
    			internal.attr_dev(text_1, "text-anchor", "middle");
    			internal.add_location(text_1, file$4, 171, 20, 6656);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, text_1, anchor);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*xValRange*/ 32 && t_value !== (t_value = /*xVal*/ ctx[25] + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*xValRange*/ 32 && text_1_x_value !== (text_1_x_value = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]))) {
    				internal.attr_dev(text_1, "x", text_1_x_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(text_1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3$1.name,
    		type: "each",
    		source: "(171:16) {#each xValRange as xVal}",
    		ctx
    	});

    	return block;
    }

    // (184:20) {#if yVal > 0}
    function create_if_block$3(ctx) {
    	let text_1;
    	let t_value = /*yVal*/ ctx[28] + "";
    	let t;
    	let text_1_x_value;
    	let text_1_y_value;

    	const block = {
    		c: function create() {
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(text_1, "x", text_1_x_value = /*margin*/ ctx[8].left);
    			internal.attr_dev(text_1, "y", text_1_y_value = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]));
    			internal.attr_dev(text_1, "dy", "18");
    			internal.attr_dev(text_1, "text-anchor", "start");
    			internal.add_location(text_1, file$4, 184, 24, 7103);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, text_1, anchor);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*yValRange*/ 64 && t_value !== (t_value = /*yVal*/ ctx[28] + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*yValRange*/ 64 && text_1_y_value !== (text_1_y_value = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]))) {
    				internal.attr_dev(text_1, "y", text_1_y_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(text_1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(184:20) {#if yVal > 0}",
    		ctx
    	});

    	return block;
    }

    // (183:16) {#each yValRange as yVal}
    function create_each_block_2$1(ctx) {
    	let if_block_anchor;
    	let if_block = /*yVal*/ ctx[28] > 0 && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = internal.empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			internal.insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (/*yVal*/ ctx[28] > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) internal.detach_dev(if_block_anchor);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$1.name,
    		type: "each",
    		source: "(183:16) {#each yValRange as yVal}",
    		ctx
    	});

    	return block;
    }

    // (199:16) {#each yValRange as yVal}
    function create_each_block_1$1(ctx) {
    	let line_1;
    	let t_value = /*yVal*/ ctx[28] + "";
    	let t;
    	let line_1_x__value;
    	let line_1_x__value_1;
    	let line_1_y__value;
    	let line_1_y__value_1;

    	const block = {
    		c: function create() {
    			line_1 = internal.svg_element("line");
    			t = internal.text(t_value);
    			internal.attr_dev(line_1, "x1", line_1_x__value = /*margin*/ ctx[8].left);
    			internal.attr_dev(line_1, "x2", line_1_x__value_1 = width$1 - /*margin*/ ctx[8].right);
    			internal.attr_dev(line_1, "y1", line_1_y__value = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]));
    			internal.attr_dev(line_1, "y2", line_1_y__value_1 = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]));
    			internal.attr_dev(line_1, "stroke", "#cccccc");
    			internal.attr_dev(line_1, "stroke-width", "0.5");
    			internal.add_location(line_1, file$4, 199, 20, 7603);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, line_1, anchor);
    			internal.append_dev(line_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*yValRange*/ 64 && t_value !== (t_value = /*yVal*/ ctx[28] + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*yValRange*/ 64 && line_1_y__value !== (line_1_y__value = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]))) {
    				internal.attr_dev(line_1, "y1", line_1_y__value);
    			}

    			if (dirty[0] & /*yValRange*/ 64 && line_1_y__value_1 !== (line_1_y__value_1 = /*yScaleLines*/ ctx[11](/*yVal*/ ctx[28]))) {
    				internal.attr_dev(line_1, "y2", line_1_y__value_1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(line_1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$1.name,
    		type: "each",
    		source: "(199:16) {#each yValRange as yVal}",
    		ctx
    	});

    	return block;
    }

    // (213:16) {#each xValRange as xVal}
    function create_each_block$2(ctx) {
    	let line_1;
    	let t_value = /*xVal*/ ctx[25] + "";
    	let t;
    	let line_1_x__value;
    	let line_1_x__value_1;
    	let line_1_y__value;
    	let line_1_y__value_1;

    	const block = {
    		c: function create() {
    			line_1 = internal.svg_element("line");
    			t = internal.text(t_value);
    			internal.attr_dev(line_1, "x1", line_1_x__value = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]));
    			internal.attr_dev(line_1, "x2", line_1_x__value_1 = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]));
    			internal.attr_dev(line_1, "y1", line_1_y__value = /*margin*/ ctx[8].top);
    			internal.attr_dev(line_1, "y2", line_1_y__value_1 = height$1 - /*margin*/ ctx[8].bottom);
    			internal.attr_dev(line_1, "stroke", "#cccccc");
    			internal.attr_dev(line_1, "stroke-width", "0.5");
    			internal.add_location(line_1, file$4, 213, 20, 8115);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, line_1, anchor);
    			internal.append_dev(line_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*xValRange*/ 32 && t_value !== (t_value = /*xVal*/ ctx[25] + "")) internal.set_data_dev(t, t_value);

    			if (dirty[0] & /*xValRange*/ 32 && line_1_x__value !== (line_1_x__value = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]))) {
    				internal.attr_dev(line_1, "x1", line_1_x__value);
    			}

    			if (dirty[0] & /*xValRange*/ 32 && line_1_x__value_1 !== (line_1_x__value_1 = /*xScaleLines*/ ctx[10](/*xVal*/ ctx[25]))) {
    				internal.attr_dev(line_1, "x2", line_1_x__value_1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(line_1);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(213:16) {#each xValRange as xVal}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div3;
    	let div1;
    	let input;
    	let t0;
    	let label;
    	let t2;
    	let div0;
    	let t3;
    	let div2;
    	let t4;
    	let svg;
    	let g0;
    	let g3;
    	let line_1;
    	let line_1_x__value;
    	let line_1_x__value_1;
    	let line_1_y__value;
    	let line_1_y__value_1;
    	let g1;
    	let g2;
    	let g6;
    	let g4;
    	let g5;
    	let svg_viewBox_value;
    	let mounted;
    	let dispose;
    	let each_value_7 = /*selectFFInds*/ ctx[2];
    	internal.validate_each_argument(each_value_7);
    	let each_blocks_6 = [];

    	for (let i = 0; i < each_value_7.length; i += 1) {
    		each_blocks_6[i] = create_each_block_7(get_each_context_7(ctx, each_value_7, i));
    	}

    	let each_value_6 = /*continents*/ ctx[9];
    	internal.validate_each_argument(each_value_6);
    	let each_blocks_5 = [];

    	for (let i = 0; i < each_value_6.length; i += 1) {
    		each_blocks_5[i] = create_each_block_6(get_each_context_6(ctx, each_value_6, i));
    	}

    	let each_value_4 = /*continents*/ ctx[9];
    	internal.validate_each_argument(each_value_4);
    	let each_blocks_4 = [];

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		each_blocks_4[i] = create_each_block_4$1(get_each_context_4$1(ctx, each_value_4, i));
    	}

    	let each_value_3 = /*xValRange*/ ctx[5];
    	internal.validate_each_argument(each_value_3);
    	let each_blocks_3 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_3[i] = create_each_block_3$1(get_each_context_3$1(ctx, each_value_3, i));
    	}

    	let each_value_2 = /*yValRange*/ ctx[6];
    	internal.validate_each_argument(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2$1(get_each_context_2$1(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*yValRange*/ ctx[6];
    	internal.validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	let each_value = /*xValRange*/ ctx[5];
    	internal.validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div3 = internal.element("div");
    			div1 = internal.element("div");
    			input = internal.element("input");
    			t0 = internal.space();
    			label = internal.element("label");
    			label.textContent = "Show per capita value";
    			t2 = internal.space();
    			div0 = internal.element("div");

    			for (let i = 0; i < each_blocks_6.length; i += 1) {
    				each_blocks_6[i].c();
    			}

    			t3 = internal.space();
    			div2 = internal.element("div");

    			for (let i = 0; i < each_blocks_5.length; i += 1) {
    				each_blocks_5[i].c();
    			}

    			t4 = internal.space();
    			svg = internal.svg_element("svg");
    			g0 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].c();
    			}

    			g3 = internal.svg_element("g");
    			line_1 = internal.svg_element("line");
    			g1 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			g2 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			g6 = internal.svg_element("g");
    			g4 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			g5 = internal.svg_element("g");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			internal.attr_dev(input, "type", "checkbox");
    			internal.attr_dev(input, "id", "toggle-ff-percap");
    			internal.attr_dev(input, "name", "Show per capita value");
    			internal.add_location(input, file$4, 98, 8, 3683);
    			internal.attr_dev(label, "for", "toggle-ff-percap");
    			internal.add_location(label, file$4, 99, 8, 3797);
    			internal.attr_dev(div0, "class", "select-ff-indicator svelte-13ibwyj");
    			internal.add_location(div0, file$4, 100, 8, 3866);
    			internal.attr_dev(div1, "class", "ui-controls svelte-13ibwyj");
    			internal.add_location(div1, file$4, 97, 4, 3648);
    			internal.attr_dev(div2, "class", "legends svelte-13ibwyj");
    			internal.add_location(div2, file$4, 109, 4, 4194);
    			internal.attr_dev(g0, "class", "conti-shapes");
    			internal.add_location(g0, file$4, 123, 8, 4641);
    			internal.attr_dev(line_1, "class", "horizontal-rule");
    			internal.attr_dev(line_1, "x1", line_1_x__value = /*margin*/ ctx[8].left);
    			internal.attr_dev(line_1, "x2", line_1_x__value_1 = width$1 - /*margin*/ ctx[8].right);
    			internal.attr_dev(line_1, "y1", line_1_y__value = height$1 - /*margin*/ ctx[8].bottom);
    			internal.attr_dev(line_1, "y2", line_1_y__value_1 = height$1 - /*margin*/ ctx[8].bottom);
    			internal.attr_dev(line_1, "stroke", "#333333");
    			internal.attr_dev(line_1, "stroke-width", "1");
    			internal.add_location(line_1, file$4, 160, 12, 6262);
    			internal.attr_dev(g1, "class", "x-axis");
    			internal.add_location(g1, file$4, 169, 12, 6573);
    			internal.attr_dev(g2, "class", "y-axis");
    			internal.add_location(g2, file$4, 181, 12, 6980);
    			internal.attr_dev(g3, "class", "axes");
    			internal.add_location(g3, file$4, 159, 8, 6232);
    			internal.attr_dev(g4, "class", "horizontal-lines");
    			internal.add_location(g4, file$4, 197, 12, 7510);
    			internal.attr_dev(g5, "class", "vertical-lines");
    			internal.add_location(g5, file$4, 211, 12, 8024);
    			internal.attr_dev(g6, "class", "grid");
    			internal.add_location(g6, file$4, 196, 8, 7480);
    			internal.attr_dev(svg, "class", "trend-line-chart svelte-13ibwyj");
    			internal.attr_dev(svg, "width", width$1);
    			internal.attr_dev(svg, "height", height$1);
    			internal.attr_dev(svg, "viewBox", svg_viewBox_value = `0, 0, ${width$1}, ${height$1}`);
    			internal.add_location(svg, file$4, 117, 4, 4503);
    			internal.attr_dev(div3, "class", "trend-line-chart svelte-13ibwyj");
    			internal.add_location(div3, file$4, 96, 0, 3612);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, div3, anchor);
    			internal.append_dev(div3, div1);
    			internal.append_dev(div1, input);
    			input.checked = /*toggleffPercap*/ ctx[0];
    			internal.append_dev(div1, t0);
    			internal.append_dev(div1, label);
    			internal.append_dev(div1, t2);
    			internal.append_dev(div1, div0);

    			for (let i = 0; i < each_blocks_6.length; i += 1) {
    				each_blocks_6[i].m(div0, null);
    			}

    			internal.append_dev(div3, t3);
    			internal.append_dev(div3, div2);

    			for (let i = 0; i < each_blocks_5.length; i += 1) {
    				each_blocks_5[i].m(div2, null);
    			}

    			internal.append_dev(div3, t4);
    			internal.append_dev(div3, svg);
    			internal.append_dev(svg, g0);

    			for (let i = 0; i < each_blocks_4.length; i += 1) {
    				each_blocks_4[i].m(g0, null);
    			}

    			internal.append_dev(svg, g3);
    			internal.append_dev(g3, line_1);
    			internal.append_dev(g3, g1);

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(g1, null);
    			}

    			internal.append_dev(g3, g2);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(g2, null);
    			}

    			internal.append_dev(svg, g6);
    			internal.append_dev(g6, g4);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g4, null);
    			}

    			internal.append_dev(g6, g5);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g5, null);
    			}

    			if (!mounted) {
    				dispose = internal.listen_dev(input, "change", /*input_change_handler*/ ctx[18]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*toggleffPercap*/ 1) {
    				input.checked = /*toggleffPercap*/ ctx[0];
    			}

    			if (dirty[0] & /*encodeInd, selectFFInds, selectFFValue*/ 134) {
    				each_value_7 = /*selectFFInds*/ ctx[2];
    				internal.validate_each_argument(each_value_7);
    				let i;

    				for (i = 0; i < each_value_7.length; i += 1) {
    					const child_ctx = get_each_context_7(ctx, each_value_7, i);

    					if (each_blocks_6[i]) {
    						each_blocks_6[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_6[i] = create_each_block_7(child_ctx);
    						each_blocks_6[i].c();
    						each_blocks_6[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_6.length; i += 1) {
    					each_blocks_6[i].d(1);
    				}

    				each_blocks_6.length = each_value_7.length;
    			}

    			if (dirty[0] & /*continents*/ 512) {
    				each_value_6 = /*continents*/ ctx[9];
    				internal.validate_each_argument(each_value_6);
    				let i;

    				for (i = 0; i < each_value_6.length; i += 1) {
    					const child_ctx = get_each_context_6(ctx, each_value_6, i);

    					if (each_blocks_5[i]) {
    						each_blocks_5[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_5[i] = create_each_block_6(child_ctx);
    						each_blocks_5[i].c();
    						each_blocks_5[i].m(div2, null);
    					}
    				}

    				for (; i < each_blocks_5.length; i += 1) {
    					each_blocks_5[i].d(1);
    				}

    				each_blocks_5.length = each_value_6.length;
    			}

    			if (dirty[0] & /*markersData, continents, xScaleLines, selectFFValue, yScaleLines, contiLinePath*/ 3610) {
    				each_value_4 = /*continents*/ ctx[9];
    				internal.validate_each_argument(each_value_4);
    				let i;

    				for (i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4$1(ctx, each_value_4, i);

    					if (each_blocks_4[i]) {
    						each_blocks_4[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_4[i] = create_each_block_4$1(child_ctx);
    						each_blocks_4[i].c();
    						each_blocks_4[i].m(g0, null);
    					}
    				}

    				for (; i < each_blocks_4.length; i += 1) {
    					each_blocks_4[i].d(1);
    				}

    				each_blocks_4.length = each_value_4.length;
    			}

    			if (dirty[0] & /*xScaleLines, xValRange, margin*/ 1312) {
    				each_value_3 = /*xValRange*/ ctx[5];
    				internal.validate_each_argument(each_value_3);
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3$1(ctx, each_value_3, i);

    					if (each_blocks_3[i]) {
    						each_blocks_3[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_3[i] = create_each_block_3$1(child_ctx);
    						each_blocks_3[i].c();
    						each_blocks_3[i].m(g1, null);
    					}
    				}

    				for (; i < each_blocks_3.length; i += 1) {
    					each_blocks_3[i].d(1);
    				}

    				each_blocks_3.length = each_value_3.length;
    			}

    			if (dirty[0] & /*margin, yScaleLines, yValRange*/ 2368) {
    				each_value_2 = /*yValRange*/ ctx[6];
    				internal.validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$1(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2$1(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(g2, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty[0] & /*margin, yScaleLines, yValRange*/ 2368) {
    				each_value_1 = /*yValRange*/ ctx[6];
    				internal.validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(g4, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty[0] & /*xScaleLines, xValRange, margin*/ 1312) {
    				each_value = /*xValRange*/ ctx[5];
    				internal.validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g5, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: internal.noop,
    		o: internal.noop,
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(div3);
    			internal.destroy_each(each_blocks_6, detaching);
    			internal.destroy_each(each_blocks_5, detaching);
    			internal.destroy_each(each_blocks_4, detaching);
    			internal.destroy_each(each_blocks_3, detaching);
    			internal.destroy_each(each_blocks_2, detaching);
    			internal.destroy_each(each_blocks_1, detaching);
    			internal.destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const height$1 = 500;
    const width$1 = 600;
    const SEL_ECON_IND = "gdp";

    // Encode legend labels
    const TWH$1 = "Production (TWh)";

    const PC_KWH$1 = "Production per capita (kWh)";

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	internal.validate_slots("TrendLinesChart", slots, []);
    	const margin = { top: 20, right: 20, bottom: 30, left: 20 };
    	const trendInds = Object.keys(trendData[0]).slice(2);
    	const ffInds = trendInds.slice(0, 6);
    	const ffTotalInds = ffInds.slice(0, 3);
    	const ffPercapInds = ffInds.slice(3, 6);
    	const continents = [...new Set(trendData.map(d => d.cont))];
    	let toggleffPercap = false;
    	let selectFFValue = "meanTotal";
    	const xScaleLines = d3Scale.scaleLinear().domain([0, 1]).range([margin.left, width$1 - margin.right]);
    	const yScaleLines = d3Scale.scaleLinear().domain([0, 1]).range([height$1 - margin.bottom, margin.top]);
    	const writable_props = [];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TrendLinesChart> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input_change_handler() {
    		toggleffPercap = this.checked;
    		$$invalidate(0, toggleffPercap);
    	}

    	function input_change_handler_1() {
    		selectFFValue = this.__value;
    		$$invalidate(1, selectFFValue);
    	}

    	$$self.$capture_state = () => ({
    		aq: aq__namespace,
    		trendData,
    		line: d3Shape.line,
    		curveCatmullRom: d3Shape.curveCatmullRom,
    		scaleLinear: d3Scale.scaleLinear,
    		median: d3Array.median,
    		extent: d3Array.extent,
    		range: d3Array.range,
    		schemeCategory10: d3ScaleChromatic.schemeCategory10,
    		height: height$1,
    		width: width$1,
    		margin,
    		trendInds,
    		ffInds,
    		ffTotalInds,
    		ffPercapInds,
    		continents,
    		toggleffPercap,
    		selectFFValue,
    		xScaleLines,
    		yScaleLines,
    		SEL_ECON_IND,
    		TWH: TWH$1,
    		PC_KWH: PC_KWH$1,
    		selectFFInds,
    		linesData,
    		linePath,
    		linesContiData,
    		yrExtent,
    		yrMid,
    		contiLinePath,
    		markersData,
    		xValRange,
    		yValRange,
    		energyUnit,
    		encodeInd
    	});

    	$$self.$inject_state = $$props => {
    		if ("toggleffPercap" in $$props) $$invalidate(0, toggleffPercap = $$props.toggleffPercap);
    		if ("selectFFValue" in $$props) $$invalidate(1, selectFFValue = $$props.selectFFValue);
    		if ("selectFFInds" in $$props) $$invalidate(2, selectFFInds = $$props.selectFFInds);
    		if ("linesData" in $$props) $$invalidate(12, linesData = $$props.linesData);
    		if ("linePath" in $$props) $$invalidate(13, linePath = $$props.linePath);
    		if ("linesContiData" in $$props) $$invalidate(14, linesContiData = $$props.linesContiData);
    		if ("yrExtent" in $$props) $$invalidate(15, yrExtent = $$props.yrExtent);
    		if ("yrMid" in $$props) $$invalidate(16, yrMid = $$props.yrMid);
    		if ("contiLinePath" in $$props) $$invalidate(3, contiLinePath = $$props.contiLinePath);
    		if ("markersData" in $$props) $$invalidate(4, markersData = $$props.markersData);
    		if ("xValRange" in $$props) $$invalidate(5, xValRange = $$props.xValRange);
    		if ("yValRange" in $$props) $$invalidate(6, yValRange = $$props.yValRange);
    		if ("energyUnit" in $$props) $$invalidate(17, energyUnit = $$props.energyUnit);
    		if ("encodeInd" in $$props) $$invalidate(7, encodeInd = $$props.encodeInd);
    	};

    	let selectFFInds;
    	let linesData;
    	let linePath;
    	let linesContiData;
    	let yrExtent;
    	let yrMid;
    	let contiLinePath;
    	let markersData;
    	let xValRange;
    	let yValRange;
    	let energyUnit;
    	let encodeInd;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*toggleffPercap*/ 1) {
    			 $$invalidate(2, selectFFInds = !toggleffPercap
    			? ["meanTotal", ...ffTotalInds]
    			: ["meanPerCap", ...ffPercapInds]);
    		}

    		if ($$self.$$.dirty[0] & /*linesData*/ 4096) {
    			// Every continent specific
    			 $$invalidate(14, linesContiData = conti => linesData.filter(d => d["cont"] === conti));
    		}

    		if ($$self.$$.dirty[0] & /*linesContiData*/ 16384) {
    			 $$invalidate(15, yrExtent = conti => d3Array.extent(linesContiData(conti), d => d.date.getFullYear()));
    		}

    		if ($$self.$$.dirty[0] & /*linesContiData*/ 16384) {
    			 $$invalidate(16, yrMid = conti => d3Array.median(linesContiData(conti), d => d.date.getFullYear()));
    		}

    		if ($$self.$$.dirty[0] & /*linePath, selectFFValue, linesContiData*/ 24578) {
    			 $$invalidate(3, contiLinePath = conti => linePath(selectFFValue, SEL_ECON_IND)(linesContiData(conti)));
    		}

    		if ($$self.$$.dirty[0] & /*linesContiData, yrExtent, yrMid*/ 114688) {
    			 $$invalidate(4, markersData = conti => linesContiData(conti).filter(d => [...yrExtent(conti), yrMid(conti)].includes(d["date"].getFullYear())));
    		}

    		if ($$self.$$.dirty[0] & /*toggleffPercap*/ 1) {
    			 $$invalidate(17, energyUnit = !toggleffPercap ? TWH$1 : PC_KWH$1);
    		}

    		if ($$self.$$.dirty[0] & /*energyUnit, selectFFInds*/ 131076) {
    			 $$invalidate(7, encodeInd = ind => {
    				switch (ind) {
    					case selectFFInds[0]:
    						return `Total ${energyUnit}`;
    					case selectFFInds[1]:
    						return `Coal ${energyUnit}`;
    					case selectFFInds[2]:
    						return `Gas ${energyUnit}`;
    					case selectFFInds[3]:
    						return `Oil ${energyUnit}`;
    					case selectFFInds[4]:
    						return `Renewable ${energyUnit}`;
    					default:
    						return "";
    				}
    			});
    		}
    	};

    	 $$invalidate(12, linesData = aq.from(trendData).derive(trendInds.reduce(
    		(obj, ind) => {
    			return {
    				...obj,
    				[ind]: aq.escape(d => {
    					if (d[ind]) {
    						const [b, e] = d[ind].split("e");
    						return b * Math.pow(10, e);
    					}
    				}), // else if(!!d.gdp) return 0
    				
    			};
    		},
    		{}
    	)).// World data has no values for gdp, remove data that
    	// has no values for the gdp
    	filter(aq.escape(d => !!d.gdp)).derive({
    		date: aq.escape(d => new Date(d.yr, 1, 1)),
    		meanTotal: aq.escape(d => ffTotalInds.reduce(
    			(mean, ind) => {
    				return (mean + d[ind]) / 2;
    			},
    			0
    		)),
    		meanPerCap: aq.escape(d => ffPercapInds.reduce(
    			(mean, ind) => {
    				return (mean + d[ind]) / 2;
    			},
    			0
    		))
    	}).// .relocate( "date", { before: "yr" })
    	select(aq.not("yr")).objects());

    	 $$invalidate(13, linePath = (keyFF, keyEcon) => d3Shape.line().// .defined(d => !isNaN(d[keyEcon]) && !isNaN(d[keyFF]))
    	curve(d3Shape.curveCatmullRom).x(d => xScaleLines(d[keyFF])).y(d => yScaleLines(d[keyEcon])));

    	// Axes tick values
    	 $$invalidate(5, xValRange = d3Array.range(0, 1 + 1 / 5, 1 / 5).map(x => x.toPrecision(1)));

    	 $$invalidate(6, yValRange = d3Array.range(0, 1 + 1 / 5, 1 / 5).map(y => y.toPrecision(1)));

    	return [
    		toggleffPercap,
    		selectFFValue,
    		selectFFInds,
    		contiLinePath,
    		markersData,
    		xValRange,
    		yValRange,
    		encodeInd,
    		margin,
    		continents,
    		xScaleLines,
    		yScaleLines,
    		linesData,
    		linePath,
    		linesContiData,
    		yrExtent,
    		yrMid,
    		energyUnit,
    		input_change_handler,
    		input_change_handler_1,
    		$$binding_groups
    	];
    }

    class TrendLinesChart extends internal.SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		internal.init(this, options, instance$4, create_fragment$4, internal.safe_not_equal, {}, [-1, -1]);

    		internal.dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TrendLinesChart",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    var RUdata = [
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 2
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 2
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 3
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 2
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 1
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Australia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 1
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 4
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 1
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 4
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 5
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 9
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 8
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 5
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 4
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 15
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 8
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 9
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 7
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 11
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 9
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 16
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 3
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 11
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 10
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 7
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 8
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 5
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 3
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 7
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 6
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 83
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 75
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 76
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 75
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 65
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 77
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 71
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 69
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 69
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 64
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 64
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 60
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 62
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 69
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 68
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 70
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 66
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 65
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 63
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 81
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 79
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 91
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 100
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 76
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Austria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 1
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 3
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 1
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 5
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 7
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 8
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 10
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 12
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 12
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 11
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 15
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 12
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 10
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 17
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 20
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 5
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 10
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 23
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 25
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 23
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 27
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 25
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 32
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 31
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 32
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 31
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 27
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 18
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 12
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 16
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 13
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 15
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 18
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 16
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 17
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 24
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 27
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 25
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 46
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 52
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 63
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 63
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 62
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 77
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 63
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 55
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 66
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 67
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 61
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 63
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 59
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 50
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 58
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 80
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 64
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 59
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 45
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 44
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 5
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 4
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 5
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 5
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 3
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 11
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Belgium",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 8
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 3
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 5
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 4
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 7
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 11
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 10
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 11
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 14
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 11
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 10
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 7
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 8
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 7
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 7
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 7
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 8
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 8
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 9
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 87
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 75
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 42
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 96
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 126
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 134
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 130
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 133
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 118
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 127
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 126
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 133
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 119
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 84
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 121
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 113
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 128
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 97
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 110
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 109
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 154
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 154
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 168
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 186
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 160
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 136
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 130
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 101
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 90
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 102
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 4
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: null
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 101
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 97
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 100
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 99
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 98
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 100
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 101
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 104
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 100
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 103
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 94
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 100
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 104
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 94
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 96
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 88
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 90
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 91
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 96
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 99
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 93
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 86
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 83
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 93
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 94
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 97
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 97
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 99
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 99
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 80
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 73
    	},
    	{
    		Country: "Bulgaria",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 77
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 2
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 3
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 3
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 1
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Canada",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 1
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 1
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 1
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 1
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 6
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Chile",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Colombia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Costa Rica",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 18
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 2
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 5
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 5
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 29
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 44
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 31
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 25
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 24
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 20
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 82
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 64
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 73
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 82
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 37
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 94
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 78
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 78
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 76
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 51
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 40
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 70
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 35
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 73
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 78
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 84
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 89
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 80
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 83
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 63
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 60
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 54
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 65
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 36
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 30
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 18
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 19
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 21
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 9
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 13
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: null
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 26
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 32
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 28
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 29
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 29
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 12
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 33
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 38
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 42
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 41
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 41
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 38
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 37
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 39
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 35
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 39
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 39
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 32
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 34
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 34
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 32
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Croatia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 78
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 84
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 59
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 111
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 123
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 89
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 230
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 50
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 118
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 105
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 98
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 3
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 29
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 23
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 63
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 26
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 4
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 1
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 2
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 1
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: null
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Cyprus",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 2
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 2
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 1
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 87
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 81
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 75
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 63
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 62
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 51
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 48
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 51
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 48
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 57
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 55
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 49
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 56
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 56
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 56
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 47
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 53
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 52
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 48
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 47
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 44
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 44
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 43
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 41
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 36
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 37
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 91
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 109
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 94
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 96
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 99
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 98
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 100
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 90
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 87
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 79
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 78
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 73
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 74
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 73
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 68
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 75
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 78
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 74
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 75
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 68
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 76
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 109
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 89
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 100
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 87
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 95
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 96
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 101
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 96
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 109
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 86
    	},
    	{
    		Country: "Czech Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 92
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 18
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 9
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 11
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 3
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 4
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 12
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 21
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 28
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 16
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 10
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 27
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 25
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 23
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 30
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 41
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 42
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 22
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 37
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 35
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 36
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 42
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 49
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 58
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 71
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 75
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 149
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 94
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 44
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 3
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 11
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 14
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 12
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 18
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 9
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 3
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 4
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 8
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 2
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 10
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 13
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 22
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 28
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 15
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 8
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 6
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 13
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 15
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Denmark",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 3
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 3
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 4
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 1
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 12
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 11
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 7
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 9
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 6
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 8
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 6
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 11
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 8
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 9
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 9
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 8
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 2
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 45
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 21
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 22
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 46
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 28
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 101
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 100
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 104
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 49
    	},
    	{
    		Country: "Estonia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 35
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 12
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 18
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 20
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 21
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 17
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 15
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 13
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 9
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 18
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 32
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 30
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 25
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 41
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 45
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 35
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 32
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 43
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 44
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 55
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 35
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 55
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 37
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 45
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 55
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 36
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 39
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 41
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 41
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 38
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 30
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 22
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 2
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 4
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 32
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 27
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 41
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 28
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 31
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 46
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 56
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 60
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 63
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 63
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 68
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 82
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 95
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 91
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 79
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 97
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 108
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 116
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 119
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 117
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 124
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 145
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 116
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 133
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 141
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 144
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 144
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 160
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 137
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 112
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 100
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 99
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 98
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 98
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 68
    	},
    	{
    		Country: "Finland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 75
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 2
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 3
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 3
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 1
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 4
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 4
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 6
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 5
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 9
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 9
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 14
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 14
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 18
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 17
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 19
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 26
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 30
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 24
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 29
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 20
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 6
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 2
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 8
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 8
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 7
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 8
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 10
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 10
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 6
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 8
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 7
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 10
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 13
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 12
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 12
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 13
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 17
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 14
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 12
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 11
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 9
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 7
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 9
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 13
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 12
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 10
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 5
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 5
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 32
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 32
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 34
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 31
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 35
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 35
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 30
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 28
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 26
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 30
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 29
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 24
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 24
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 23
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 21
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 20
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 16
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 13
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 15
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 16
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 14
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 16
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 18
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 22
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 16
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 14
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 21
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 20
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 23
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 25
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 20
    	},
    	{
    		Country: "France",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 27
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 2
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 4
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 6
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 6
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 7
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 7
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 8
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 9
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 8
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 8
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 10
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 11
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 12
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 14
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 17
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 17
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 22
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 20
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 24
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 8
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 13
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 18
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 16
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 20
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 19
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 20
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 22
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 24
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 24
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 26
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 28
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 32
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 32
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 31
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 34
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 35
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 35
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 31
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 30
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 36
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 32
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 28
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 30
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 31
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 38
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 33
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 32
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 34
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 38
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 38
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 35
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 34
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 36
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 39
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 39
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 35
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 36
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 37
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 41
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 41
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 40
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 41
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 42
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 34
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 38
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 40
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 39
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 46
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 49
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 56
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 70
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 69
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 49
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 51
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 59
    	},
    	{
    		Country: "Germany",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 60
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 7
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 1
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 4
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 4
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 3
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 1
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 2
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 4
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 5
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 5
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 6
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 9
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 11
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 12
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 10
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 12
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 18
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 20
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 20
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 18
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 8
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 12
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 32
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 40
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 61
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 52
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 39
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 39
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 36
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 45
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 45
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 46
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 57
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 38
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 68
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 77
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 77
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 71
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 58
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 57
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 73
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 57
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 83
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 64
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 16
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 76
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 95
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 100
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 73
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 73
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 73
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 75
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 80
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 83
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 80
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 76
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 65
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 56
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 52
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 59
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 55
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 66
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 57
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 61
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 63
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 58
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 65
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 31
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 39
    	},
    	{
    		Country: "Greece",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 40
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 7
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 10
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 2
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 2
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 3
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 4
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 3
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 3
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 6
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 12
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 16
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 13
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 15
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 13
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 13
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 6
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 2
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 1
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 4
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 8
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 5
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 11
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 10
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 83
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 88
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 87
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 88
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 88
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 80
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 87
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 88
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 93
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 93
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 94
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 97
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 82
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 90
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 99
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 94
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 93
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 90
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 78
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 75
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 56
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 61
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 61
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 53
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 46
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 58
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 56
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 53
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 57
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 53
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 60
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 71
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 53
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 59
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 63
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 67
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 64
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 72
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 76
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 64
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 60
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 66
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 60
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 69
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 71
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 76
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 70
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 79
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 83
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 101
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 72
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 75
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 91
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 74
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 109
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 72
    	},
    	{
    		Country: "Hungary",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 64
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 7
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 6
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 6
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 7
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 7
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 7
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 8
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 3
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 7
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 4
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 5
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 4
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 3
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 4
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 1
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 1
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Iceland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 3
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 6
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 1
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 2
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 6
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 8
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Ireland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 18
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 16
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 14
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 20
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 23
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 23
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 21
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 28
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 38
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 2
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Israel",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 3
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 8
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 7
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 6
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 3
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 1
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 5
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 5
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 6
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 7
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 3
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 4
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 6
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 10
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 11
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 12
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 20
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 19
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 21
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 37
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 37
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 43
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 49
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 56
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 2
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 20
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 16
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 13
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 13
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 14
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 19
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 20
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 24
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 23
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 22
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 23
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 26
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 23
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 22
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 24
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 31
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 23
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 20
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 16
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 16
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 22
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 17
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 17
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 29
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 26
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 26
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 24
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 24
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 30
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 29
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 29
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 27
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 28
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 26
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 18
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 25
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 24
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 40
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 39
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 41
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 38
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 44
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 45
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 45
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 40
    	},
    	{
    		Country: "Italy",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 38
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 3
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 3
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 9
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 10
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 10
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 11
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 12
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 13
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 14
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 12
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 1
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 7
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 5
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 4
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 3
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 3
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 6
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 9
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 9
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 10
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 9
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 9
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Japan",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 9
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 3
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 3
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 10
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 11
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 12
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 14
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 18
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 20
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 19
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 19
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 19
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 21
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 1
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 9
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 8
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 7
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 4
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 6
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 5
    	},
    	{
    		Country: "Korea",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 5
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 80
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 48
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 44
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 40
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 45
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 30
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 29
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 43
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 51
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 66
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 43
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 51
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 68
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 86
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 89
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 92
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 119
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 91
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 90
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 95
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 83
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 56
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 77
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 100
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 83
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 95
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 96
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 101
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 101
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 98
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 102
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 48
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 10
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 9
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 7
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 8
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 9
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 13
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 7
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 9
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 8
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 11
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 14
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 19
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 21
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 21
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 18
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 16
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 12
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 13
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 113
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 100
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 124
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 67
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 98
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 99
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 100
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 99
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 106
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 104
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 102
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 86
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 89
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 104
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 130
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 106
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 109
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 97
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 82
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 114
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 62
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 109
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 114
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 116
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 72
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 99
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 83
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 102
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 99
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 100
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 100
    	},
    	{
    		Country: "Latvia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 24
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 141
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 52
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 107
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 36
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 90
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 85
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 85
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 67
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 54
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 48
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 63
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 60
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 63
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 61
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 60
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 55
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 66
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 58
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 79
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 99
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 85
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 97
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 82
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 78
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 76
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 87
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 78
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 91
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 72
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 78
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 160
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 229
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 258
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 258
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 311
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 329
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 337
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 315
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 207
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 308
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 337
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 358
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 364
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 345
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 368
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 277
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 295
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 306
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 243
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 230
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 270
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 213
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 236
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 103
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 101
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 101
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 101
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 103
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 96
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 100
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 99
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 86
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 39
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 58
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 61
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 53
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 50
    	},
    	{
    		Country: "Lithuania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 43
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 7
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 7
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 7
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 23
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 23
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 24
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 24
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 24
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 24
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 25
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 25
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 25
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 25
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 27
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 27
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 27
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 27
    	},
    	{
    		Country: "Luxembourg",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: null
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Malta",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 2
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 1
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Mexico",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 1
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 1
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 1
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 3
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 3
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 6
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 8
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 8
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 10
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 13
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 14
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 19
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 14
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 15
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 17
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 20
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 27
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 32
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 39
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 39
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 43
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 51
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 38
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 10
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 5
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 12
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 8
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 11
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 11
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 14
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 13
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 7
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 16
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 22
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 31
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 36
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 44
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 59
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 66
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 70
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 64
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 68
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 73
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 71
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 73
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 72
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 74
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 71
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 86
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 106
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 123
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 135
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 90
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 67
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 85
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 9
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 11
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 10
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 11
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 7
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 7
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 4
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 6
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 9
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 16
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 20
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 30
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 26
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 46
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 42
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 41
    	},
    	{
    		Country: "Netherlands",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 31
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 7
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 9
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 4
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 4
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 7
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 15
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 11
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 7
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 13
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 7
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 9
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 12
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 19
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 17
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 14
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 9
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 15
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 15
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 15
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 18
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 17
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 20
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 18
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 18
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 1
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 6
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 1
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 8
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 6
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 6
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 2
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 5
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 4
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 4
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 6
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 3
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 4
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Norway",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 2
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "New Zealand",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 1
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 2
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 3
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 3
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 4
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 6
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 9
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 9
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 11
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 8
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 8
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 8
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 6
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 7
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 11
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 17
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 15
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 15
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 11
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 101
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 88
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 97
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 98
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 87
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 83
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 80
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 68
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 71
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 75
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 92
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 86
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 92
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 88
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 82
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 85
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 86
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 87
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 82
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 84
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 89
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 91
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 103
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 107
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 107
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 106
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 87
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 77
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 79
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 68
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 68
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 56
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 76
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 69
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 69
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 57
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 60
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 64
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 61
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 58
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 65
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 53
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 54
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 58
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 57
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 53
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 43
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 46
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 49
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 45
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 51
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 55
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 62
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 64
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 59
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 58
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 55
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 53
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 62
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 55
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 50
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 49
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 46
    	},
    	{
    		Country: "Poland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 47
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 3
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 3
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 6
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 6
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 5
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 6
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 5
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 8
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 10
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 6
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 4
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 17
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 14
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 16
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 33
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 43
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 34
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 18
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 7
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 12
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 2
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 11
    	},
    	{
    		Country: "Portugal",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 14
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 19
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 10
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 8
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 11
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 10
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 14
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 15
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 17
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 11
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 12
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 9
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 11
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 7
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 3
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 4
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 2
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 2
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 3
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 3
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 4
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 6
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 9
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 10
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 36
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 29
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 32
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 42
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 51
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 41
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 47
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 30
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 30
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 32
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 19
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 19
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 35
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 37
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 42
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 45
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 44
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 44
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 42
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 32
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: null
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 21
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 16
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 17
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 18
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 20
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 25
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 29
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 25
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 26
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 18
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 20
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 18
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 23
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 26
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 30
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 30
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 32
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 28
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 28
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 15
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 16
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 19
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 18
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 11
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 4
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 2
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 13
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 10
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 11
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 9
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Romania",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 23
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 12
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 17
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 12
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 8
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 20
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 25
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 25
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 25
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 24
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 21
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 32
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 32
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 26
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 26
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 22
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 18
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 24
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 19
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 24
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 31
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 33
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 27
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 21
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 179
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 160
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 174
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 182
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 156
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 170
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 171
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 160
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 168
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 152
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 171
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 165
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 182
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 177
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 182
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 168
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 146
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 141
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 140
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 154
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 133
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 105
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 94
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 96
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 86
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 93
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 87
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 92
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 93
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 94
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 91
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 99
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 92
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 100
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 97
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 103
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 103
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 106
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 100
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 99
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 108
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 100
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 105
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 91
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 96
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 105
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 95
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 92
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 89
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 90
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 137
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 75
    	},
    	{
    		Country: "Slovak Republic",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 65
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 2
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 2
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 1
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 95
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 96
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 70
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 66
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 56
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 51
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 54
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 58
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 40
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 60
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 51
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 51
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 47
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 48
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 47
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 48
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 42
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 58
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 37
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 30
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 34
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 23
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 31
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 12
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "Slovenia",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 1
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 1
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 4
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 5
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 6
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 7
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 6
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 10
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 13
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 13
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 12
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 12
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 8
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 10
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 14
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 14
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 12
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 19
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 15
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 25
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 21
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 37
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 51
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 35
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 6
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 10
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 8
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 7
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 10
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 13
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 16
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 14
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 14
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 19
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 22
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 15
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 17
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 15
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 18
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 18
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 19
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 18
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 12
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 13
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 8
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 4
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 7
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 12
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 3
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 9
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 11
    	},
    	{
    		Country: "Spain",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 10
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 12
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 9
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 11
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 6
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 10
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 6
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 6
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 5
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 5
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 7
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 4
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 5
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 4
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 10
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 21
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 18
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 17
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 20
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 14
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 17
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 16
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 14
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 15
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 15
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 16
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 15
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 15
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 17
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 14
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 20
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 24
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 1
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 8
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 6
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 3
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 1
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 1
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 12
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 14
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 16
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 10
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 8
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 24
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 26
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 37
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 51
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 53
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 47
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 54
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 63
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 64
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 72
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 71
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 60
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 78
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 105
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 92
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 82
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 74
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 56
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 26
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 26
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 14
    	},
    	{
    		Country: "Sweden",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 3
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 2
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 3
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 11
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 8
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 6
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 1
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 3
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 13
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 17
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 17
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 15
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 16
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 12
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 14
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 13
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 13
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 13
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "Switzerland",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 4
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 5
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 4
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 3
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 3
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 4
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 8
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 9
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 11
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 12
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 15
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 11
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 17
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 19
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 19
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 19
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 20
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 21
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 18
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 19
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 20
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 16
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 18
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 18
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 16
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 21
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 20
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 23
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 19
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 21
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 26
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 21
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 9
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 2
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 5
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 1
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 5
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 2
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 2
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 3
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 9
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 7
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 17
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 13
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 16
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 22
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 25
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 23
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 30
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 24
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 22
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 14
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 10
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 9
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 8
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 5
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 11
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 10
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 7
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 7
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 26
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 10
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 14
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 94
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 95
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 96
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 96
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 90
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 79
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 67
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 65
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 60
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 67
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 65
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 66
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 64
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 58
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 61
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 62
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 60
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 61
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 63
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 55
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 46
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 57
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 59
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 57
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 55
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 56
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 53
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 53
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 47
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 34
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 34
    	},
    	{
    		Country: "Republic of Turkiye",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 44
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 1
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 6
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 7
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 6
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 16
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 29
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 36
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 34
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 37
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 39
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 19
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 25
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 29
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 34
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 37
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 22
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 13
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 26
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 36
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 27
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 20
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 23
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 7
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 7
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 5
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 5
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 5
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 5
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 2
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 6
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 8
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 13
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 8
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 14
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 13
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 13
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 9
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 8
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 10
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 13
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 9
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 5
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 6
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 8
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 6
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 8
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 9
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 7
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 4
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 3
    	},
    	{
    		Country: "United Kingdom",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 4
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Coal",
    		Year: 2021,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2002,
    		Percentage: 1
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2003,
    		Percentage: 1
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2004,
    		Percentage: 1
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2005,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2006,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2007,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2008,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2009,
    		Percentage: 3
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2010,
    		Percentage: 4
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2011,
    		Percentage: 4
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2012,
    		Percentage: 3
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2013,
    		Percentage: 3
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2014,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2015,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2016,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2017,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2018,
    		Percentage: 2
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2019,
    		Percentage: 3
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2020,
    		Percentage: 4
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Oil",
    		Year: 2021,
    		Percentage: 4
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1990,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1991,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1992,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1993,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1994,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1995,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1996,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1997,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1998,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 1999,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2000,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2001,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2002,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2003,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2004,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2005,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2006,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2007,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2008,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2009,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2010,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2011,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2012,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2013,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2014,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2015,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2016,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2017,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2018,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2019,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2020,
    		Percentage: 0
    	},
    	{
    		Country: "United States",
    		Fossil_Fuel: "Natural Gas",
    		Year: 2021,
    		Percentage: 0
    	}
    ];

    /* src\components\RussianImportsChart.svelte generated by Svelte v3.31.0 */
    const file$5 = "src\\components\\RussianImportsChart.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[17] = list[i];
    	child_ctx[19] = i;
    	return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[20] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[20] = list[i];
    	return child_ctx;
    }

    function get_each_context_3$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[17] = list[i];
    	return child_ctx;
    }

    // (64:8) {#each countries as country}
    function create_each_block_3$2(ctx) {
    	let option;
    	let t_value = /*country*/ ctx[17] + "";
    	let t;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = internal.element("option");
    			t = internal.text(t_value);
    			option.__value = option_value_value = /*country*/ ctx[17];
    			option.value = option.__value;
    			internal.add_location(option, file$5, 64, 12, 1905);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, option, anchor);
    			internal.append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*countries*/ 16 && t_value !== (t_value = /*country*/ ctx[17] + "")) internal.set_data_dev(t, t_value);

    			if (dirty & /*countries*/ 16 && option_value_value !== (option_value_value = /*country*/ ctx[17])) {
    				internal.prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(option);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3$2.name,
    		type: "each",
    		source: "(64:8) {#each countries as country}",
    		ctx
    	});

    	return block;
    }

    // (75:8) {#each [1990, 1995, 2000, 2005, 2010, 2015, 2020] as tickValue}
    function create_each_block_2$2(ctx) {
    	let g;
    	let line_1;
    	let text_1;
    	let t;
    	let text_1_y_value;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = internal.svg_element("g");
    			line_1 = internal.svg_element("line");
    			text_1 = internal.svg_element("text");
    			t = internal.text(/*tickValue*/ ctx[20]);
    			internal.attr_dev(line_1, "y2", /*innerHeight*/ ctx[9]);
    			internal.attr_dev(line_1, "stroke", "#333333");
    			internal.attr_dev(line_1, "stroke-width", "1");
    			internal.add_location(line_1, file$5, 77, 12, 2427);
    			internal.attr_dev(text_1, "text-anchor", "middle");
    			internal.attr_dev(text_1, "dy", "18");
    			internal.attr_dev(text_1, "y", text_1_y_value = /*innerHeight*/ ctx[9] + 18);
    			internal.add_location(text_1, file$5, 80, 12, 2525);
    			internal.attr_dev(g, "transform", g_transform_value = `translate(${/*xScale*/ ctx[2](/*tickValue*/ ctx[20])},0)`);
    			internal.add_location(g, file$5, 76, 12, 2362);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g, anchor);
    			internal.append_dev(g, line_1);
    			internal.append_dev(g, text_1);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*xScale*/ 4 && g_transform_value !== (g_transform_value = `translate(${/*xScale*/ ctx[2](/*tickValue*/ ctx[20])},0)`)) {
    				internal.attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2$2.name,
    		type: "each",
    		source: "(75:8) {#each [1990, 1995, 2000, 2005, 2010, 2015, 2020] as tickValue}",
    		ctx
    	});

    	return block;
    }

    // (88:12) {#if tickValue}
    function create_if_block$4(ctx) {
    	let g;
    	let text_1;
    	let t_value = /*tickValue*/ ctx[20] + "";
    	let t;
    	let text_1_x_value;
    	let g_transform_value;

    	const block = {
    		c: function create() {
    			g = internal.svg_element("g");
    			text_1 = internal.svg_element("text");
    			t = internal.text(t_value);
    			internal.attr_dev(text_1, "text-anchor", "end");
    			internal.attr_dev(text_1, "dy", ".71em");
    			internal.attr_dev(text_1, "x", text_1_x_value = /*margin*/ ctx[8].left);
    			internal.add_location(text_1, file$5, 89, 16, 2824);
    			internal.attr_dev(g, "transform", g_transform_value = `translate(0,${/*yScale*/ ctx[3](/*tickValue*/ ctx[20])})`);
    			internal.add_location(g, file$5, 88, 16, 2755);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, g, anchor);
    			internal.append_dev(g, text_1);
    			internal.append_dev(text_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*yScale*/ 8 && t_value !== (t_value = /*tickValue*/ ctx[20] + "")) internal.set_data_dev(t, t_value);

    			if (dirty & /*yScale*/ 8 && g_transform_value !== (g_transform_value = `translate(0,${/*yScale*/ ctx[3](/*tickValue*/ ctx[20])})`)) {
    				internal.attr_dev(g, "transform", g_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(g);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(88:12) {#if tickValue}",
    		ctx
    	});

    	return block;
    }

    // (87:8) {#each yScale.ticks() as tickValue}
    function create_each_block_1$2(ctx) {
    	let if_block_anchor;
    	let if_block = /*tickValue*/ ctx[20] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = internal.empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			internal.insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (/*tickValue*/ ctx[20]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) internal.detach_dev(if_block_anchor);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1$2.name,
    		type: "each",
    		source: "(87:8) {#each yScale.ticks() as tickValue}",
    		ctx
    	});

    	return block;
    }

    // (98:8) {#each countries as country, i}
    function create_each_block$3(ctx) {
    	let path;
    	let path_d_value;
    	let path_stroke_value;
    	let path_stroke_width_value;

    	function func(...args) {
    		return /*func*/ ctx[12](/*country*/ ctx[17], ...args);
    	}

    	const block = {
    		c: function create() {
    			path = internal.svg_element("path");
    			internal.attr_dev(path, "d", path_d_value = /*linePath*/ ctx[7]("Year", "Percentage")(/*data*/ ctx[1].filter(func)));
    			internal.attr_dev(path, "stroke", path_stroke_value = /*colorScale*/ ctx[5](/*country*/ ctx[17]));
    			internal.attr_dev(path, "fill", "none");
    			internal.attr_dev(path, "stroke-width", path_stroke_width_value = /*strokeScale*/ ctx[6](/*country*/ ctx[17]));
    			internal.add_location(path, file$5, 98, 12, 3137);
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, path, anchor);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*linePath, data, countries*/ 146 && path_d_value !== (path_d_value = /*linePath*/ ctx[7]("Year", "Percentage")(/*data*/ ctx[1].filter(func)))) {
    				internal.attr_dev(path, "d", path_d_value);
    			}

    			if (dirty & /*colorScale, countries*/ 48 && path_stroke_value !== (path_stroke_value = /*colorScale*/ ctx[5](/*country*/ ctx[17]))) {
    				internal.attr_dev(path, "stroke", path_stroke_value);
    			}

    			if (dirty & /*strokeScale, countries*/ 80 && path_stroke_width_value !== (path_stroke_width_value = /*strokeScale*/ ctx[6](/*country*/ ctx[17]))) {
    				internal.attr_dev(path, "stroke-width", path_stroke_width_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(path);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(98:8) {#each countries as country, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div;
    	let section;
    	let select;
    	let option;
    	let t1;
    	let svg;
    	let g;
    	let each1_anchor;
    	let text_1;
    	let t2;
    	let text_1_x_value;
    	let text_1_y_value;
    	let svg_viewBox_value;
    	let mounted;
    	let dispose;
    	let each_value_3 = /*countries*/ ctx[4];
    	internal.validate_each_argument(each_value_3);
    	let each_blocks_3 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_3[i] = create_each_block_3$2(get_each_context_3$2(ctx, each_value_3, i));
    	}

    	let each_value_2 = [1990, 1995, 2000, 2005, 2010, 2015, 2020];
    	internal.validate_each_argument(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < 7; i += 1) {
    		each_blocks_2[i] = create_each_block_2$2(get_each_context_2$2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*yScale*/ ctx[3].ticks();
    	internal.validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
    	}

    	let each_value = /*countries*/ ctx[4];
    	internal.validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = internal.element("div");
    			section = internal.element("section");
    			select = internal.element("select");
    			option = internal.element("option");
    			option.textContent = "Select a country.";

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			t1 = internal.space();
    			svg = internal.svg_element("svg");
    			g = internal.svg_element("g");

    			for (let i = 0; i < 7; i += 1) {
    				each_blocks_2[i].c();
    			}

    			each1_anchor = internal.empty();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			text_1 = internal.svg_element("text");
    			t2 = internal.text("%");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			option.__value = "";
    			option.value = option.__value;
    			option.selected = true;
    			internal.add_location(option, file$5, 62, 8, 1801);
    			internal.attr_dev(select, "class", "menu");
    			internal.attr_dev(select, "name", "menu");
    			internal.attr_dev(select, "id", "menu");
    			if (/*highlight*/ ctx[0] === void 0) internal.add_render_callback(() => /*select_change_handler*/ ctx[11].call(select));
    			internal.add_location(select, file$5, 58, 4, 1659);
    			internal.attr_dev(section, "class", "menu-cont");
    			internal.add_location(section, file$5, 57, 3, 1626);
    			internal.attr_dev(text_1, "text-anchor", "end");
    			internal.attr_dev(text_1, "dy", ".71em");
    			internal.attr_dev(text_1, "x", text_1_x_value = /*margin*/ ctx[8].left);
    			internal.attr_dev(text_1, "y", text_1_y_value = /*margin*/ ctx[8].top);
    			internal.add_location(text_1, file$5, 96, 8, 3008);
    			internal.add_location(g, file$5, 72, 8, 2092);
    			internal.attr_dev(svg, "width", width$2);
    			internal.attr_dev(svg, "height", height$2);
    			internal.attr_dev(svg, "viewBox", svg_viewBox_value = [0, 0, width$2, height$2]);
    			internal.add_location(svg, file$5, 68, 4, 2001);
    			internal.attr_dev(div, "class", "imports-line");
    			internal.add_location(div, file$5, 55, 0, 1508);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, div, anchor);
    			internal.append_dev(div, section);
    			internal.append_dev(section, select);
    			internal.append_dev(select, option);

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(select, null);
    			}

    			internal.select_option(select, /*highlight*/ ctx[0]);
    			internal.append_dev(div, t1);
    			internal.append_dev(div, svg);
    			internal.append_dev(svg, g);

    			for (let i = 0; i < 7; i += 1) {
    				each_blocks_2[i].m(g, null);
    			}

    			internal.append_dev(g, each1_anchor);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(g, null);
    			}

    			internal.append_dev(g, text_1);
    			internal.append_dev(text_1, t2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(g, null);
    			}

    			if (!mounted) {
    				dispose = internal.listen_dev(select, "change", /*select_change_handler*/ ctx[11]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*countries*/ 16) {
    				each_value_3 = /*countries*/ ctx[4];
    				internal.validate_each_argument(each_value_3);
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3$2(ctx, each_value_3, i);

    					if (each_blocks_3[i]) {
    						each_blocks_3[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_3[i] = create_each_block_3$2(child_ctx);
    						each_blocks_3[i].c();
    						each_blocks_3[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks_3.length; i += 1) {
    					each_blocks_3[i].d(1);
    				}

    				each_blocks_3.length = each_value_3.length;
    			}

    			if (dirty & /*highlight, countries*/ 17) {
    				internal.select_option(select, /*highlight*/ ctx[0]);
    			}

    			if (dirty & /*xScale, innerHeight*/ 516) {
    				each_value_2 = [1990, 1995, 2000, 2005, 2010, 2015, 2020];
    				internal.validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < 7; i += 1) {
    					const child_ctx = get_each_context_2$2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2$2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(g, each1_anchor);
    					}
    				}

    				for (; i < 7; i += 1) {
    					each_blocks_2[i].d(1);
    				}
    			}

    			if (dirty & /*yScale, margin*/ 264) {
    				each_value_1 = /*yScale*/ ctx[3].ticks();
    				internal.validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(g, text_1);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*linePath, data, countries, colorScale, strokeScale*/ 242) {
    				each_value = /*countries*/ ctx[4];
    				internal.validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(g, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: internal.noop,
    		o: internal.noop,
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(div);
    			internal.destroy_each(each_blocks_3, detaching);
    			internal.destroy_each(each_blocks_2, detaching);
    			internal.destroy_each(each_blocks_1, detaching);
    			internal.destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const height$2 = 400;
    const width$2 = 600;

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	internal.validate_slots("RussianImportsChart", slots, []);
    	let { filter } = $$props;
    	const margin = { top: 20, right: 20, bottom: 20, left: 60 };
    	const innerHeight = height$2 - margin.top - margin.bottom;
    	const innerWidth = width$2 - margin.left - margin.right;
    	let colour = "black";
    	let opacity = "0.0";
    	const writable_props = ["filter"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<RussianImportsChart> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		highlight = internal.select_value(this);
    		$$invalidate(0, highlight);
    		(($$invalidate(4, countries), $$invalidate(1, data)), $$invalidate(10, filter));
    	}

    	const func = (country, d) => d.Country === country;

    	$$self.$$set = $$props => {
    		if ("filter" in $$props) $$invalidate(10, filter = $$props.filter);
    	};

    	$$self.$capture_state = () => ({
    		line: d3Shape.line,
    		curveBasis: d3Shape.curveBasis,
    		scaleLinear: d3Scale.scaleLinear,
    		scaleUtc: d3Scale.scaleUtc,
    		max: d3Array.max,
    		extent: d3Array.extent,
    		RUdata,
    		filter,
    		height: height$2,
    		width: width$2,
    		margin,
    		innerHeight,
    		innerWidth,
    		colour,
    		opacity,
    		highlight,
    		data,
    		countries,
    		xScale,
    		yScale,
    		colorScale,
    		opacityScale,
    		strokeScale,
    		linePath
    	});

    	$$self.$inject_state = $$props => {
    		if ("filter" in $$props) $$invalidate(10, filter = $$props.filter);
    		if ("colour" in $$props) colour = $$props.colour;
    		if ("opacity" in $$props) opacity = $$props.opacity;
    		if ("highlight" in $$props) $$invalidate(0, highlight = $$props.highlight);
    		if ("data" in $$props) $$invalidate(1, data = $$props.data);
    		if ("countries" in $$props) $$invalidate(4, countries = $$props.countries);
    		if ("xScale" in $$props) $$invalidate(2, xScale = $$props.xScale);
    		if ("yScale" in $$props) $$invalidate(3, yScale = $$props.yScale);
    		if ("colorScale" in $$props) $$invalidate(5, colorScale = $$props.colorScale);
    		if ("opacityScale" in $$props) opacityScale = $$props.opacityScale;
    		if ("strokeScale" in $$props) $$invalidate(6, strokeScale = $$props.strokeScale);
    		if ("linePath" in $$props) $$invalidate(7, linePath = $$props.linePath);
    	};

    	let highlight;
    	let data;
    	let countries;
    	let xScale;
    	let yScale;
    	let colorScale;
    	let opacityScale;
    	let strokeScale;
    	let linePath;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*filter*/ 1024) {
    			 $$invalidate(1, data = RUdata.filter(d => d.Fossil_Fuel == filter));
    		}

    		if ($$self.$$.dirty & /*data*/ 2) {
    			 $$invalidate(4, countries = [...new Set(data.map(d => d.Country))]);
    		}

    		if ($$self.$$.dirty & /*data*/ 2) {
    			 $$invalidate(3, yScale = d3Scale.scaleLinear().domain([0, d3Array.max(data.map(d => d.Percentage))]).range([height$2 - margin.bottom, margin.top]));
    		}

    		if ($$self.$$.dirty & /*highlight*/ 1) {
    			 $$invalidate(5, colorScale = country => {
    				if (country == highlight) {
    					return "blue";
    				} else {
    					return "grey";
    				}
    			});
    		}

    		if ($$self.$$.dirty & /*highlight*/ 1) {
    			 opacityScale = country => {
    				if (country == highlight) {
    					return "1.0";
    				} else {
    					return "0.0";
    				}
    			};
    		}

    		if ($$self.$$.dirty & /*highlight*/ 1) {
    			 $$invalidate(6, strokeScale = country => {
    				if (country == highlight) {
    					return 2.5;
    				} else {
    					return 1.5;
    				}
    			});
    		}

    		if ($$self.$$.dirty & /*xScale, yScale*/ 12) {
    			 $$invalidate(7, linePath = (keyYear, keyFF) => d3Shape.line().curve(d3Shape.curveBasis).x(d => xScale(d[keyYear])).y(d => yScale(d[keyFF])));
    		}
    	};

    	 $$invalidate(0, highlight = "Germany");
    	 $$invalidate(2, xScale = d3Scale.scaleLinear().domain([1990, 2021]).range([margin.left, width$2 - margin.right]));

    	return [
    		highlight,
    		data,
    		xScale,
    		yScale,
    		countries,
    		colorScale,
    		strokeScale,
    		linePath,
    		margin,
    		innerHeight,
    		filter,
    		select_change_handler,
    		func
    	];
    }

    class RussianImportsChart extends internal.SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		internal.init(this, options, instance$5, create_fragment$5, internal.safe_not_equal, { filter: 10 });

    		internal.dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "RussianImportsChart",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*filter*/ ctx[10] === undefined && !("filter" in props)) {
    			console.warn("<RussianImportsChart> was created without expected prop 'filter'");
    		}
    	}

    	get filter() {
    		throw new Error("<RussianImportsChart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set filter(value) {
    		throw new Error("<RussianImportsChart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.31.0 */
    const file$6 = "src\\App.svelte";

    function create_fragment$6(ctx) {
    	let main;
    	let section0;
    	let h1;
    	let t1;
    	let p;
    	let t2;
    	let br0;
    	let br1;
    	let t3;
    	let t4;
    	let section1;
    	let h30;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let button0;
    	let t10;
    	let button1;
    	let t12;
    	let button2;
    	let t14;
    	let br2;
    	let t15;
    	let russianimportschart;
    	let t16;
    	let br3;
    	let t17;
    	let br4;
    	let t18;
    	let t19;
    	let section2;
    	let h31;
    	let t21;
    	let ffrenchart;
    	let t22;
    	let section3;
    	let h32;
    	let t24;
    	let trendlineschart;
    	let current;
    	let mounted;
    	let dispose;

    	russianimportschart = new RussianImportsChart({
    			props: { filter: /*importFilter*/ ctx[0] },
    			$$inline: true
    		});

    	ffrenchart = new FFRenChart({ $$inline: true });
    	trendlineschart = new TrendLinesChart({ $$inline: true });

    	const block = {
    		c: function create() {
    			main = internal.element("main");
    			section0 = internal.element("section");
    			h1 = internal.element("h1");
    			h1.textContent = "Fossil Fuel Production";
    			t1 = internal.space();
    			p = internal.element("p");
    			t2 = internal.text("During the last 120 years, countries started to produce more and more fossilfuels (gas, oil and coal). But, we can also see them changing the amount of production. Why is that? We explore the data about fossil fuel production in order to find out what impacts a country to produce more or less fossil fuels. We have three hypothesises: There might be political reasons (independence from other countries), social reasons or economic benefits. We leave the topic of sustainablity out as there is another team looking deeply at that.\r\n\t\t");
    			br0 = internal.element("br");
    			br1 = internal.element("br");
    			t3 = internal.text("\r\n\t\tLet's start with the most recent topic: Fossil fuel production dominates public discourse in many countries at the moment, especially in Europe. The reason for that is the Russian invasion in Ukraine. The war has caused many countries to no longer want to rely on supplies from Russia. On the one hand, Russia does not seem to be a reliable economic partner anymore. On the other hand, politicians do not want to trade with Russia anymore for moral reasons.\r\n\t\tAs there are no up-to-date information about fossil fuel imports from Russia since the start of the invasion in February 2021, we have a look at the data from 1990 to 2021 - we would expect a decrease of Russian imports already after 2014 because in that year, Russia invaded the Ukrainian Crimea.");
    			t4 = internal.space();
    			section1 = internal.element("section");
    			h30 = internal.element("h3");
    			t5 = internal.text("Russian agression does not impact ");
    			t6 = internal.text(/*importFilter*/ ctx[0]);
    			t7 = internal.text(" imports");
    			t8 = internal.space();
    			button0 = internal.element("button");
    			button0.textContent = "Gas";
    			t10 = internal.space();
    			button1 = internal.element("button");
    			button1.textContent = "Coal";
    			t12 = internal.space();
    			button2 = internal.element("button");
    			button2.textContent = "Oil";
    			t14 = internal.space();
    			br2 = internal.element("br");
    			t15 = internal.space();
    			internal.create_component(russianimportschart.$$.fragment);
    			t16 = internal.space();
    			br3 = internal.element("br");
    			t17 = internal.text("\r\n\t\tThe chart shows which percentage of the countrie's consumption of each fossil fuel is imported from Russia. We don't see a clear pattern. But, a closer look at the chart reveals that countries which are close to Russia (e.g. Estonia and Lithuania) particularly depend on Russian imports. At first sight it might seem irritating that some countries import more than 100 percent of their consumption from Russia. That is because some import more than they consume, for example because they save it.");
    			br4 = internal.element("br");
    			t18 = internal.text("\r\n\t\tWe don't see a sharp decrease of fossil fuel imports from Russia after 2014 or in the following years. From that we conclude that political independence was not an important motivation to stop importing and to start producing more. However, this might change at the moment.");
    			t19 = internal.space();
    			section2 = internal.element("section");
    			h31 = internal.element("h3");
    			h31.textContent = "Renewable energy production remains insignificant compared to total fossil fuel production";
    			t21 = internal.space();
    			internal.create_component(ffrenchart.$$.fragment);
    			t22 = internal.space();
    			section3 = internal.element("section");
    			h32 = internal.element("h3");
    			h32.textContent = "Reducing fossil fuel may not necessarily mean a decline in GDP";
    			t24 = internal.space();
    			internal.create_component(trendlineschart.$$.fragment);
    			internal.attr_dev(h1, "class", "svelte-3rozfi");
    			internal.add_location(h1, file$6, 25, 2, 863);
    			internal.add_location(br0, file$6, 28, 2, 1441);
    			internal.add_location(br1, file$6, 28, 6, 1445);
    			internal.add_location(p, file$6, 26, 2, 899);
    			internal.attr_dev(section0, "class", "header svelte-3rozfi");
    			internal.add_location(section0, file$6, 24, 1, 835);
    			internal.add_location(h30, file$6, 34, 2, 2280);
    			internal.add_location(button0, file$6, 35, 2, 2349);
    			internal.add_location(button1, file$6, 36, 2, 2424);
    			internal.add_location(button2, file$6, 37, 2, 2493);
    			internal.add_location(br2, file$6, 38, 2, 2560);
    			internal.add_location(br3, file$6, 40, 2, 2618);
    			internal.add_location(br4, file$6, 41, 498, 3122);
    			internal.attr_dev(section1, "class", "content russian-imports svelte-3rozfi");
    			internal.add_location(section1, file$6, 33, 1, 2235);
    			internal.add_location(h31, file$6, 45, 2, 3470);
    			internal.attr_dev(section2, "class", "content fossil-fuel-renewable svelte-3rozfi");
    			internal.add_location(section2, file$6, 44, 1, 3419);
    			internal.add_location(h32, file$6, 49, 2, 3650);
    			internal.attr_dev(section3, "class", "content fossil-fuel-trend svelte-3rozfi");
    			internal.add_location(section3, file$6, 48, 1, 3603);
    			internal.attr_dev(main, "class", "svelte-3rozfi");
    			internal.add_location(main, file$6, 23, 0, 826);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			internal.insert_dev(target, main, anchor);
    			internal.append_dev(main, section0);
    			internal.append_dev(section0, h1);
    			internal.append_dev(section0, t1);
    			internal.append_dev(section0, p);
    			internal.append_dev(p, t2);
    			internal.append_dev(p, br0);
    			internal.append_dev(p, br1);
    			internal.append_dev(p, t3);
    			internal.append_dev(main, t4);
    			internal.append_dev(main, section1);
    			internal.append_dev(section1, h30);
    			internal.append_dev(h30, t5);
    			internal.append_dev(h30, t6);
    			internal.append_dev(h30, t7);
    			internal.append_dev(section1, t8);
    			internal.append_dev(section1, button0);
    			internal.append_dev(section1, t10);
    			internal.append_dev(section1, button1);
    			internal.append_dev(section1, t12);
    			internal.append_dev(section1, button2);
    			internal.append_dev(section1, t14);
    			internal.append_dev(section1, br2);
    			internal.append_dev(section1, t15);
    			internal.mount_component(russianimportschart, section1, null);
    			internal.append_dev(section1, t16);
    			internal.append_dev(section1, br3);
    			internal.append_dev(section1, t17);
    			internal.append_dev(section1, br4);
    			internal.append_dev(section1, t18);
    			internal.append_dev(main, t19);
    			internal.append_dev(main, section2);
    			internal.append_dev(section2, h31);
    			internal.append_dev(section2, t21);
    			internal.mount_component(ffrenchart, section2, null);
    			internal.append_dev(main, t22);
    			internal.append_dev(main, section3);
    			internal.append_dev(section3, h32);
    			internal.append_dev(section3, t24);
    			internal.mount_component(trendlineschart, section3, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					internal.listen_dev(button0, "click", /*click_handler*/ ctx[2], false, false, false),
    					internal.listen_dev(button1, "click", /*click_handler_1*/ ctx[3], false, false, false),
    					internal.listen_dev(button2, "click", /*click_handler_2*/ ctx[4], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*importFilter*/ 1) internal.set_data_dev(t6, /*importFilter*/ ctx[0]);
    			const russianimportschart_changes = {};
    			if (dirty & /*importFilter*/ 1) russianimportschart_changes.filter = /*importFilter*/ ctx[0];
    			russianimportschart.$set(russianimportschart_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			internal.transition_in(russianimportschart.$$.fragment, local);
    			internal.transition_in(ffrenchart.$$.fragment, local);
    			internal.transition_in(trendlineschart.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			internal.transition_out(russianimportschart.$$.fragment, local);
    			internal.transition_out(ffrenchart.$$.fragment, local);
    			internal.transition_out(trendlineschart.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) internal.detach_dev(main);
    			internal.destroy_component(russianimportschart);
    			internal.destroy_component(ffrenchart);
    			internal.destroy_component(trendlineschart);
    			mounted = false;
    			internal.run_all(dispose);
    		}
    	};

    	internal.dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	internal.validate_slots("App", slots, []);
    	let importFilter = "Natural Gas";

    	function changeImportFilter(choice) {
    		if (choice == "Natural Gas") {
    			$$invalidate(0, importFilter = "Natural Gas");
    		} else if (choice == "Coal") {
    			$$invalidate(0, importFilter = "Coal");
    		} else if (choice == "Oil") {
    			$$invalidate(0, importFilter = "Oil");
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => changeImportFilter("Natural Gas");
    	const click_handler_1 = () => changeImportFilter("Coal");
    	const click_handler_2 = () => changeImportFilter("Oil");

    	$$self.$capture_state = () => ({
    		onMount: svelte.onMount,
    		Line,
    		FfRenChart: FFRenChart,
    		TrendLinesChart,
    		RussianImportsChart,
    		importFilter,
    		changeImportFilter
    	});

    	$$self.$inject_state = $$props => {
    		if ("importFilter" in $$props) $$invalidate(0, importFilter = $$props.importFilter);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		importFilter,
    		changeImportFilter,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class App extends internal.SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		internal.init(this, options, instance$6, create_fragment$6, internal.safe_not_equal, {});

    		internal.dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    const app = new App({
      target: document.getElementById('app'),
    });

    return app;

}(internal, svelte, d3Array, aq, d3Shape, d3Scale, d3ScaleChromatic));
//# sourceMappingURL=bundle.js.map
