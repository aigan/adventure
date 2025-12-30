import { log, assert } from "./debug.mjs"
import * as DB from './db.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Session } from './session.mjs'
import { logos } from './logos.mjs'

/** @type {BroadcastChannel|null} */
let channel = null
let client_id_sequence = 0 // Client id
/** @type {number|null} */
let server_id = null
/** @type {Session|null} */
let session = null

/** @type {{[key: string]: (...args: any[]) => void | Promise<void>}} */
export const dispatch = {
	/** @param {any} _dat */
	async connect(_dat){
		await Session.readyP
		const client_id = ++ client_id_sequence;
		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "welcome",
			client_id,
			server_id,
		})
	},

	/** @param {any} _dat */
	hello(_dat){
		throw Error("Multiple servers")
	},

	/** @param {{client_id: number}} param0 */
	query_adventure({client_id}){
		assert(session instanceof Session, 'session not initialized')
		assert(session.world, 'session.world not initialized')
		assert(session.state, 'session.state not initialized');

    (/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "adventure_info",
			server_id,
			client_id,
			world_mind_id: session.world._id,
			world_mind_label: session.world.label,
			state_id: session.state._id,
		})
	},

//	query(dat){
//		const label = dat.label
//		log(`Asking for ${label}`)
//		const et = world.get_by_template(label)
//		log(et)
//	},

	/** @param {{mind: string|number, state_id: string|number, client_id: number}} param0 */
	query_mind({mind, state_id, client_id}){
		// Accept mind id (numeric string) or label (string)
		const mind_str = String(mind)
		const mind_obj = /^\d+$/.test(mind_str)
			? Mind.get_by_id(Number(mind_str))
			: Mind.get_by_label(mind_str)

		assert(mind_obj instanceof Mind, `Mind not found: ${mind}`)

		const state = DB.get_state(Number(state_id))

		assert(state instanceof State, `State not found: ${state_id}`)
		assert(state.in_mind === mind_obj, `State ${state_id} does not belong to mind ${mind}`)

		const data = []
		// @heavy - building inspection view for UI
		for (const belief of state.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_label(),
				desig: belief.sysdesig(state),
			})
		}

		// Build mind path from world to current mind
		// Each entry includes the mind's own state (via ground_state chain)
		/** @type {{id: number, label: string|null, type: string, vt: number|null, state_id: number}[]} */
		const mind_path = []
		/** @type {Mind|null|undefined} */
		let path_mind = mind_obj
		/** @type {State|null|undefined} */
		let path_state = state
		while (path_mind && path_state) {
			mind_path.unshift({
				id: path_mind._id,
				label: path_mind.label,
				type: path_mind._type,
				vt: path_state.vt,
				state_id: path_state._id,
			})
			// Walk up to parent mind via ground_state
			// Validate that ground_state belongs to parent mind before using it
			/** @type {State|null|undefined} */
			const next_state = path_state.ground_state
			/** @type {Mind|null|undefined} */
			const next_mind = path_mind._parent
			if (next_state && next_mind && next_state.in_mind !== next_mind) {
				break // FIXME: use assert and fix any bug that would trigger the assert
			}
			path_state = next_state
			path_mind = next_mind
		}

		const state_info = /** @type {{id: number, tt: number, vt: number, mind_id: number, mind_label: string|null, self_label: string|null|undefined, base_id: number|null, branch_ids: number[], beliefs: {id: number, label: string|null, desig: string}[], locked?: boolean}} */ ({
			id: state._id,
			tt: state.tt,
			vt: state.vt,
			mind_id: state.in_mind._id,
			mind_label: state.in_mind.label,
			self_label: state.in_mind.self?.get_label(),
			base_id: state.base?._id ?? null,
			branch_ids: state.get_branches().map(b => b._id),
			beliefs: data,
		})
		// Only include locked field if unlocked (to highlight mutable state)
		if (!state.locked) {
			state_info.locked = false
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: state_info,
			mind_path,
		})
	},

	/** @param {{state: string|number, client_id: number}} param0 */
	query_state({state, client_id}){
		const state_id = Number(state)

		const state_obj = DB.get_state(state_id)

		assert(state_obj instanceof State, `State not found: ${state_id}`)

		const data = []
		// @heavy - building inspection view for UI
		for (const belief of state_obj.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_label(),
				desig: belief.sysdesig(state_obj),
			})
		}

		// Build mind path from world to current mind
		// Each entry includes the mind's own state (via ground_state chain)
		/** @type {{id: number, label: string|null, type: string, vt: number|null, state_id: number}[]} */
		const mind_path = []
		/** @type {Mind|null|undefined} */
		let path_mind = state_obj.in_mind
		/** @type {State|null|undefined} */
		let path_state = state_obj
		while (path_mind && path_state) {
			mind_path.unshift({
				id: path_mind._id,
				label: path_mind.label,
				type: path_mind._type,
				vt: path_state.vt,
				state_id: path_state._id,
			})
			// Walk up to parent mind via ground_state
			// Validate that ground_state belongs to parent mind before using it
			/** @type {State|null|undefined} */
			const next_state = path_state.ground_state
			/** @type {Mind|null|undefined} */
			const next_mind = path_mind._parent
			if (next_state && next_mind && next_state.in_mind !== next_mind) {
				break // FIXME: use assert and fix any bug that would trigger the assert
			}
			path_state = next_state
			path_mind = next_mind
		}

		const state_info = /** @type {{id: number, tt: number, vt: number, mind_id: number, mind_label: string|null, self_label: string|null|undefined, base_id: number|null, branch_ids: number[], beliefs: {id: number, label: string|null, desig: string}[], locked?: boolean}} */ ({
			id: state_obj._id,
			tt: state_obj.tt,
			vt: state_obj.vt,
			mind_id: state_obj.in_mind._id,
			mind_label: state_obj.in_mind.label,
			self_label: state_obj.in_mind.self?.get_label(),
			base_id: state_obj.base?._id ?? null,
			branch_ids: state_obj.get_branches().map(b => b._id),
			beliefs: data,
		})
		// Only include locked field if unlocked (to highlight mutable state)
		if (!state_obj.locked) {
			state_info.locked = false
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: state_info,
			mind_path,
		})
	},

	/** @param {{belief: string|number, state_id: string|number, client_id: number}} param0 */
	query_belief({belief, state_id, client_id}){
		const belief_id = Number(belief)

		// Find belief by id in global registry
		const belief_obj = DB.get_belief_by_id(belief_id)

		assert(belief_obj instanceof Belief, `Belief not found: ${belief_id}`)

		const state_id_num = Number(state_id)
		const state = DB.get_state(state_id_num)

		assert(state instanceof State, `State not found: ${state_id}`)

		// Build mind path from world to current mind
		// Each entry includes the mind's own state (via ground_state chain)
		/** @type {{id: number, label: string|null, type: string, vt: number|null, state_id: number}[]} */
		const mind_path = []
		/** @type {Mind|null|undefined} */
		let path_mind = belief_obj.in_mind
		/** @type {State|null|undefined} */
		let path_state = state
		while (path_mind && path_state) {
			mind_path.unshift({
				id: path_mind._id,
				label: path_mind.label,
				type: path_mind._type,
				vt: path_state.vt,
				state_id: path_state._id,
			})
			// Walk up to parent mind via ground_state
			// Validate that ground_state belongs to parent mind before using it
			/** @type {State|null|undefined} */
			const next_state = path_state.ground_state
			/** @type {Mind|null|undefined} */
			const next_mind = path_mind._parent
			if (next_state && next_mind && next_state.in_mind !== next_mind) {
				// ground_state doesn't match parent mind - stop walking
				log('Warning: ground_state mismatch', {
					state: path_state._id,
					ground_state: next_state._id,
					ground_state_mind: next_state.in_mind?._id,
					expected_mind: next_mind._id
				})
				break
			}
			path_state = next_state
			path_mind = next_mind
		}

		// Find sibling states at same vt
		/** @type {{id: number, is_current: boolean}[]} */
		const sibling_states = []
		const mind = state.in_mind
		for (const s of mind._states) {
			if (s.vt === state.vt) {
				sibling_states.push({
					id: s._id,
					is_current: s._id === state._id,
				})
			}
		}
		sibling_states.sort((a, b) => a.id - b.id)

		// Get parent states (base chain)
		/** @type {number[]} */
		const parent_state_ids = []
		let base_state = state.base
		while (base_state) {
			parent_state_ids.push(base_state._id)
			base_state = base_state.base
		}

		// Check if belief existed at this state's vt
		const belief_created_vt = belief_obj.origin_state?.vt ?? null
		if (belief_created_vt !== null && state.vt !== null && state.vt < belief_created_vt) {
			// Return response with full navigation but indicating belief doesn't exist at this state
			;(/** @type {BroadcastChannel} */ (channel)).postMessage({
				msg: "belief_not_found",
				server_id,
				client_id,
				belief_id,
				state_id: state._id,
				state_tt: state.tt,
				state_vt: state.vt,
				state_locked: state.locked,
				ground_state_id: state.ground_state?._id ?? null,
				branch_ids: state.get_branches().map(b => b._id),
				parent_state_ids,
				sibling_states,
				mind_path,
				belief_created_vt,
				// Basic belief info for header display
				desig: belief_obj.sysdesig(belief_obj.origin_state ?? state),
				archetypes: [...belief_obj.get_archetypes().map(a => a.label)],
			})
			return
		}

		// Build rev_traits object from rev_traits generator
		/** @type {Record<string, any[]>} */
		const rev_traits = {}
		for (const [traittype, ref_belief] of belief_obj.rev_traits(state)) {
			const label = traittype.label
			if (!rev_traits[label]) rev_traits[label] = []
			rev_traits[label].push({
				_type: 'Belief',
				_ref: ref_belief._id,
				label: ref_belief.get_label(),
				mind_id: ref_belief.in_mind?._id,
				mind_label: ref_belief.in_mind?.label,
			})
		}

		const response = {
			msg: "world_entity",
			server_id,
			client_id,
			state_id: state._id,
			state_tt: state.tt,
			state_vt: state.vt,
			state_locked: state.locked,
			ground_state_id: state.ground_state?._id ?? null,
			branch_ids: state.get_branches().map(b => b._id),
			parent_state_ids,
			sibling_states,
			mind_path,
			origin_state_id: belief_obj.origin_state?._id ?? null,
			data: {
				data: belief_obj.to_inspect_view(state),
				rev_traits,
			},
			desig: belief_obj.sysdesig(state),
			mind: belief_obj.in_mind ? {id: belief_obj.in_mind._id, label: belief_obj.in_mind.label} : null,
			bases: [...belief_obj._bases.values().map(b => b.to_inspect_base())],
		};

		//log('response', response)

		(/** @type {BroadcastChannel} */ (channel)).postMessage(response)
	},

	/** @param {{belief: string|number, state_id: string|number, trait: string, client_id: number}} param0 */
	query_trait({belief, state_id, trait, client_id}){
		const belief_id = Number(belief)
		const belief_obj = DB.get_belief_by_id(belief_id)
		assert(belief_obj instanceof Belief, `Belief not found: ${belief_id}`)

		const state_id_num = Number(state_id)
		const state = DB.get_state(state_id_num)
		assert(state instanceof State, `State not found: ${state_id}`)


    log('query_trait')


    // Build mind path
		/** @type {{id: number, label: string|null, type: string, vt: number|null, state_id: number}[]} */
		const mind_path = []
		/** @type {Mind|null|undefined} */
		let path_mind = belief_obj.in_mind
		/** @type {State|null|undefined} */
		let path_state = state
		while (path_mind && path_state) {
			mind_path.unshift({
				id: path_mind._id,
				label: path_mind.label,
				type: path_mind._type,
				vt: path_state.vt,
				state_id: path_state._id,
			})
			// Walk up to parent mind via ground_state
			// Validate that ground_state belongs to parent mind before using it
			/** @type {State|null|undefined} */
			const next_state = path_state.ground_state
			/** @type {Mind|null|undefined} */
			const next_mind = path_mind._parent
			if (next_state && next_mind && next_state.in_mind !== next_mind) {
				break
			}
			path_state = next_state
			path_mind = next_mind
		}

		// Get current trait value
		// Try to get traittype - if it doesn't exist, access trait directly
		const traittype = Traittype.get_by_label(trait)
		const raw_value = traittype ? belief_obj.get_trait(state, traittype) : belief_obj._traits.get(trait)
		// Serialize for postMessage
		const current_value = traittype ? traittype.to_inspect_view(state, raw_value) : raw_value

		// Find trait source (own vs inherited)
		let source = 'inherited'
		let source_belief_id = belief_obj._id
		let source_belief_desig = belief_obj.sysdesig(state)
		if (Object.prototype.hasOwnProperty.call(belief_obj._traits, trait)) {
			source = 'own'
		} else {
			// Walk base chain to find where it's defined
			for (const base of belief_obj._bases) {
				if (base instanceof Belief && Object.prototype.hasOwnProperty.call(base._traits, trait)) {
					source_belief_id = base._id
					source_belief_desig = base.sysdesig(state)
					break
				}
			}
		}

		// Build value history by walking state chain
		// Only include states where the belief existed (created at or before that state)
		const belief_created_vt = belief_obj.origin_state?.vt ?? null
		/** @type {Array<{state_id: number, vt: number|null, value: any, is_current: boolean}>} */
		const history = []
		/** @type {State|null} */
		let walk_state = state
		const seen_states = new Set()
		while (walk_state && history.length < 20) {
			if (seen_states.has(walk_state._id)) break
			seen_states.add(walk_state._id)

			// Skip states before the belief was created
			if (belief_created_vt !== null && walk_state.vt !== null && walk_state.vt < belief_created_vt) {
				walk_state = walk_state.base
				continue
			}

			const raw_hist_value = traittype ? belief_obj.get_trait(walk_state, traittype) : belief_obj._traits.get(trait)
			// Serialize for postMessage
			const value = traittype ? traittype.to_inspect_view(walk_state, raw_hist_value) : raw_hist_value
			history.push({
				state_id: walk_state._id,
				vt: walk_state.vt,
				value,
				is_current: walk_state._id === state._id,
			})

			walk_state = walk_state.base
		}

		// Get state navigation (same as query_belief)
		const sibling_states = []
		const mind = state.in_mind
		for (const s of mind._states) {
			if (s.vt === state.vt) {
				sibling_states.push({
					id: s._id,
					is_current: s._id === state._id,
				})
			}
		}
		sibling_states.sort((a, b) => a.id - b.id)

		const parent_state_ids = []
		let base_state = state.base
		while (base_state) {
			parent_state_ids.push(base_state._id)
			base_state = base_state.base
		}

		/** @type {any} */
		const response = {
			msg: "trait_view",
			server_id,
			client_id,
			belief_id: belief_obj._id,
			belief_label: belief_obj.get_label(),
			belief_desig: belief_obj.sysdesig(state),
			state_id: state._id,
			state_vt: state.vt,
			state_locked: state.locked,
			branch_ids: state.get_branches().map(b => b._id),
			parent_state_ids,
			sibling_states,
			mind_path,
			trait_name: trait,
			current_value,
			source,
			source_belief_id,
			source_belief_desig,
			history,
		};

		// Debug: find functions in response (with cycle detection)
		/** @param {any} obj @param {string} path @param {Set<any>} seen */
		const findFunctions = (obj, path = '', seen = new Set()) => {
			if (typeof obj === 'function') {
				console.error('FUNCTION FOUND at:', path)
				console.error('Function:', obj.toString().slice(0, 200))
				return true
			}
			if (obj && typeof obj === 'object') {
				if (seen.has(obj)) return false
				seen.add(obj)
				// Check if obj is a Traittype
				if (obj.constructor?.name === 'Traittype') {
					console.error('TRAITTYPE FOUND at:', path, obj.label)
					return true
				}
				for (const [key, val] of Object.entries(obj)) {
					if (findFunctions(val, path ? `${path}.${key}` : key, seen)) return true
				}
			}
			return false
		}
		const hasFunc = findFunctions(response)
		if (hasFunc) {
			console.error('Response has non-serializable content!')
		}

		// Try to send response, with detailed error on failure
		try {
			(/** @type {BroadcastChannel} */ (channel)).postMessage(response)
		} catch (e) {
			console.error('postMessage failed:', e)
			// Try to identify which field causes the issue
			for (const [key, val] of Object.entries(response)) {
				try {
					structuredClone(val)
				} catch (fieldErr) {
					console.error(`Field '${key}' cannot be cloned:`, val)
					// Try to serialize as JSON for debug
					try {
						JSON.stringify(val)
					} catch {
						console.error(`Field '${key}' also fails JSON.stringify`)
					}
				}
			}
			// Re-throw to report the error
			throw e
		}
	},

	/** @param {{id: string|number, client_id: number}} param0 */
	query_entity({id, client_id}){
		assert(session instanceof Session, 'session not initialized')
		assert(session.state, 'session.state not initialized')
		id = Number(id)
		//log("query_entity", id)

		// Find belief by id in current state
		let belief = null
		// @heavy - searching for belief by id
		for (const b of session.state.get_beliefs()) {
			if (b._id === id) {
				belief = b
				break
			}
		}

		assert(belief instanceof Belief, `Belief ${id} not found in Session.state`);

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			data: {
				data: belief.toJSON(),
			},
			desig: belief.sysdesig(session.state),
			mind: belief.in_mind ? {id: belief.in_mind._id, label: belief.in_mind.label} : null,
			bases: [...belief._bases.values().map(b => b.to_inspect_base())],
		})
	},

	/** @param {{archetype: string, client_id: number}} param0 */
	query_archetype({archetype, client_id}) {
		const archetype_obj = Archetype.get_by_label(archetype)

		assert(archetype_obj instanceof Archetype, `Archetype not found: ${archetype}`)

		// Build traits object from archetype template
		/** @type {Record<string, any>} */
		const traits = {}
		for (const [traittype, value] of archetype_obj.get_trait_entries()) {
			// Format trait values for display
			let formatted_value
			if (value instanceof Archetype) {
				formatted_value = {_type: 'Archetype', label: value.label}
			} else if (value === null) {
				formatted_value = null
			} else {
				formatted_value = value
			}
			traits[traittype.label] = formatted_value
		}

		// Build mind path with Logos as navigation home
		const mind_path = []
		const logos_mind = logos()
		if (logos_mind) {
			mind_path.push({
				id: logos_mind._id,
				label: logos_mind.label,
				type: logos_mind._type,
				vt: null,
				state_id: null,
			})
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "archetype_info",
			server_id,
			client_id,
			mind_path,
			data: {
				label: archetype_obj.label,
				bases: [...archetype_obj._bases.values().map(b => ({label: b.label}))],
				traits: traits,
			},
			desig: archetype_obj.sysdesig(),
		})
	},

	/** @param {{archetype: string, trait: string, client_id: number}} param0 */
	query_archetype_trait({archetype, trait, client_id}) {
		const archetype_obj = Archetype.get_by_label(archetype)
		assert(archetype_obj instanceof Archetype, `Archetype not found: ${archetype}`)

		// Get traittype
		const traittype = Traittype.get_by_label(trait)

		// Get template value from archetype
		let template_value = null
		if (traittype) {
			template_value = archetype_obj._traits_template.get(traittype)
		}

		// Build traittype metadata
		/** @type {any} */
		let traittype_metadata = null
		if (traittype) {
			traittype_metadata = {
				label: traittype.label,
				data_type: traittype.data_type,
				composable: traittype.composable,
				values: traittype.values,
				exposure: traittype.exposure,
				container: traittype.container,
				mind_scope: traittype.mind_scope,
				constraints: traittype.constraints,
			}
		}

		// Build mind path with Logos as navigation home
		const mind_path = []
		const logos_mind = logos()
		if (logos_mind) {
			mind_path.push({
				id: logos_mind._id,
				label: logos_mind.label,
				type: logos_mind._type,
				vt: null,
				state_id: null,
			})
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "archetype_trait_view",
			server_id,
			client_id,
			mind_path,
			archetype_label: archetype_obj.label,
			trait_name: trait,
			template_value,
			traittype_metadata,
		})
	},

	/** @param {{mind: string|number, client_id: number}} param0 */
	query_mind_info({mind, client_id}) {
		// Accept mind id (numeric string) or label (string)
		const mind_str = String(mind)
		const mind_obj = /^\d+$/.test(mind_str)
			? Mind.get_by_id(Number(mind_str))
			: Mind.get_by_label(mind_str)

		assert(mind_obj instanceof Mind, `Mind not found: ${mind}`)

		// Build mind path from world to current mind
		/** @type {{id: number, label: string|null, type: string}[]} */
		const mind_path = []
		/** @type {Mind|null|undefined} */
		let path_mind = mind_obj
		while (path_mind) {
			mind_path.unshift({
				id: path_mind._id,
				label: path_mind.label,
				type: path_mind._type,
			})
			path_mind = path_mind._parent
		}

		// Get child minds
		const child_minds = []
		// @heavy - iterating all minds to find children (debugging only)
		const registries = /** @type {{mind_by_id: Map<number, Mind>}} */ (DB._reflect())
		for (const child of registries.mind_by_id.values()) {
			if (child._parent === mind_obj) {
				child_minds.push({
					id: child._id,
					label: child.label,
					type: child._type,
				})
			}
		}

		// Get states belonging to this mind
		const states = []
		for (const state of mind_obj._states) {
			states.push({
				id: state._id,
				tt: state.tt,
				vt: state.vt,
				locked: state.locked,
				base_id: state.base?._id ?? null,
			})
		}
		// Client will handle sorting

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "mind_info",
			server_id,
			client_id,
			data: {
				id: mind_obj._id,
				label: mind_obj.label,
				type: mind_obj._type,
				parent: mind_obj._parent ? {
					id: mind_obj._parent._id,
					label: mind_obj._parent.label,
				} : null,
				self_label: mind_obj.self?.get_label(),
				child_minds,
				states,
			},
			mind_path,
			desig: mind_obj.sysdesig(),
		})
	},
}

/**
 * @param {Session} session_param - session instance from world.mjs
 */
export async function init_channel(session_param) {
	session = session_param

	channel = new BroadcastChannel('inspect')
	server_id = await increment_sequence("server_id")

	// Wire up session to channel for state change notifications
	session.set_channel(channel)

	//log("Server id", server_id)
	channel.postMessage({
		msg: "hello",
		server_id,
	})

	channel.onmessage = ev => {
		const dat = ev.data
		const msg = dat.msg
		if( !msg ) return console.error("Got confused message", dat)
		if( !dispatch[msg] ) return console.error('Message confused:', dat )
		//log("message", dat)
		if( dat.server_id !== server_id && dat.msg !== "connect" )
			return console.error('Server mismatch', dat)
		dispatch[msg](dat)
	}

	return { channel, dispatch, server_id }
}


/**
 * @param {string} label
 * @returns {Promise<number>}
 */
function increment_sequence( label ){
	// Using IndexedID to absolutely elliminate race conditions

	return new Promise( (resolve,_reject)=>{
		const db_req = indexedDB.open("adventure")
		db_req.onupgradeneeded = /** @param {IDBVersionChangeEvent} ev */ (ev) => {
			const db = /** @type {IDBOpenDBRequest} */ (ev.target).result
			db.createObjectStore("counters")
		}

		db_req.onsuccess = /** @param {Event} ev */ (ev) => {
			const db = /** @type {IDBOpenDBRequest} */ (ev.target).result
			const tr = db.transaction('counters', 'readwrite')
			const st = tr.objectStore('counters')

			const req_get = st.get(label)
			req_get.onsuccess = ()=>{
				//let res = req_get.result
				const value = 1 + (req_get.result ?? 0)
				st.put(value, label)
				resolve( value )
			}
		}
	})
}
