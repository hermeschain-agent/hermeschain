"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VirtualMachine = exports.logGasCost = exports.GAS_COSTS = exports.GasMeter = exports.parseVmProgram = exports.interpreter = exports.Interpreter = void 0;
var Interpreter_1 = require("./Interpreter");
Object.defineProperty(exports, "Interpreter", { enumerable: true, get: function () { return Interpreter_1.Interpreter; } });
Object.defineProperty(exports, "interpreter", { enumerable: true, get: function () { return Interpreter_1.interpreter; } });
Object.defineProperty(exports, "parseVmProgram", { enumerable: true, get: function () { return Interpreter_1.parseVmProgram; } });
var GasMeter_1 = require("./GasMeter");
Object.defineProperty(exports, "GasMeter", { enumerable: true, get: function () { return GasMeter_1.GasMeter; } });
Object.defineProperty(exports, "GAS_COSTS", { enumerable: true, get: function () { return GasMeter_1.GAS_COSTS; } });
Object.defineProperty(exports, "logGasCost", { enumerable: true, get: function () { return GasMeter_1.logGasCost; } });
/** Legacy byte-opcode stub — retained for any caller still importing it. */
class VirtualMachine {
    constructor() {
        this.stack = [];
        this.bytecodeIndex = 0;
        this.bytecode = new Uint8Array();
    }
    execute(bytecode) {
        this.bytecode = bytecode;
        this.bytecodeIndex = 0;
        this.stack = [];
        while (this.bytecodeIndex < bytecode.length) {
            this.executeOpcode(bytecode[this.bytecodeIndex]);
            this.bytecodeIndex++;
        }
        return this.stack;
    }
    executeOpcode(opcode) {
        switch (opcode) {
            case 0x01: // PUSH
                this.bytecodeIndex++;
                this.stack.push(this.bytecode[this.bytecodeIndex] || 0);
                break;
            case 0x02: // POP
                this.stack.pop();
                break;
            case 0x03: // ADD
                const a = this.stack.pop() || 0;
                const b = this.stack.pop() || 0;
                this.stack.push(a + b);
                break;
            case 0x04: // MUL
                const x = this.stack.pop() || 0;
                const y = this.stack.pop() || 0;
                this.stack.push(x * y);
                break;
            case 0x05: // JMP
                this.bytecodeIndex++;
                this.bytecodeIndex = (this.bytecode[this.bytecodeIndex] || 0) - 1;
                break;
            case 0x06: // JMPZ
                const condition = this.stack.pop() || 0;
                this.bytecodeIndex++;
                if (condition === 0) {
                    this.bytecodeIndex = (this.bytecode[this.bytecodeIndex] || 0) - 1;
                }
                break;
            case 0x00: // NOP
                break;
            default:
                // Unknown opcode - ignore
                break;
        }
    }
    getStack() {
        return [...this.stack];
    }
}
exports.VirtualMachine = VirtualMachine;
//# sourceMappingURL=index.js.map