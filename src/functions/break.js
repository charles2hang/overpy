/* 
 * This file is part of OverPy (https://github.com/Zezombye/overpy).
 * Copyright (c) 2019 Zezombye.
 * 
 * This program is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU General Public License as published by  
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License 
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

astParsingFunctions.break = function(content) {

    //Determine the innermost loop or switch
    var innermostStructure = content.parent;
    while (innermostStructure !== undefined) {
        if (["__while__", "__for__", "__switch__", "__doWhile__"].includes(innermostStructure.name)) {
            break;
        } else {
            innermostStructure = innermostStructure.parent;
        }
    }

    if (innermostStructure.name === "__switch__") {
        var labelName = "__label_"+getUniqueNumber()+"__";
        //Place a label at the end
        innermostStructure.children.push(new Ast(labelName, [], [], "Label"));
        //Convert the switch to a goto
        return new Ast("__skip__", [new Ast("__distanceTo__", [new Ast(labelName, [], [], "Label")])]);

    } else if (innermostStructure.name === "__doWhile__") {
        error("Break in do/while is not yet supported");

    } else if (innermostStructure.name === "__while__" || innermostStructure.name === "__for__") {
        return content;

    } else {
        error("Found 'break' instruction, but not within a loop");
    }
}
