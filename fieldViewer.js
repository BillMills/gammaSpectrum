/*
Copyright (c) 2014 Bill Mills

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
function fieldViewer(canvasID){

	////////////////////////////////////////////////////////////////////////
	//member variables//////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////
	//canvas & context
	this.canvasID = canvasID; //canvas ID
	this.canvas = document.getElementById(canvasID); //dom element pointer to canvas
	this.canvas.style.backgroundColor = '#333333';
	this.context = this.canvas.getContext('2d'); //context pointer
	this.stage = new createjs.Stage(canvasID);  //transform the canvas into an easelJS sandbox
	this.containerMain = new createjs.Container(); //layer for main plot
	this.containerOverlay = new createjs.Container(); //layer for overlay: cursors, range highlights
	this.stage.addChild(this.containerMain);
	this.stage.addChild(this.containerOverlay);

	//axes & drawing
	this.fontScale = Math.min(Math.max(this.canvas.width / 50, 10), 16); // 10 < fontScale < 16
	this.context.font = this.fontScale + 'px Arial';
	this.leftMargin = Math.max(7*this.fontScale, this.canvas.width*0.05); //px
	this.rightMargin = 20; //px
	this.bottomMargin = 50; //px
	this.topMargin = 20; //px
	this.xAxisPixLength = this.canvas.width - this.leftMargin - this.rightMargin; //px
	this.yAxisPixLength = this.canvas.height - this.topMargin - this.bottomMargin; //px
	this.binWidthX = 0; //px
	this.binWidthY = 0; //px
	this.XaxisLimitMin = 0; //default min bin to show on x-axis
	this.XaxisLimitMax = 100; //default max bin to show on x-axis
	this.YaxisLimitMin = 0; //default min bin to show on y-axis
	this.YaxisLimitMax = 100; //default max bin to show on y-axis
	this.XaxisLimitAbsMax = 512; //highest maximum allowed on the x-axis
	this.YaxisLimitAbsMax = 512; //highest maximum allowed on the y-axis
	this.XaxisLength = this.XaxisLimitMax-this.XaxisLimitMin; //length of x-axis in bins
	this.YaxisLength = this.YaxisLimitMax-this.YaxisLimitMin; //height of y-axis in bins
	this.axisColor = '#999999'; //color for axes
	this.axisLineWidth = 1; //weight of axis lines in px
	this.nXticks = 5; //default number of ticks on the x axis
	this.nYticks = 5; //default number of ticks on the y axis
	this.tickLength = 5; //default tick length in px
	this.xLabelOffset = 5; //default x label offset in px
	this.yLabelOffset = 5; //default y label offset in px
	this.zAxisType = 0; //0 == linear, 1 == log
	this.baseFont = '16px Arial'; //default base font
	this.expFont = '12px Arial'; //default font for exponents
	this.xAxisTitle = 'X'; //default x-axis title
	this.yAxisTitle = 'Y'; //default y-axis title
	this.drawCallback = function(){}; //callback after plotData, no arguments passed.
	this.demandXmin = null; //override values for x and y limits, to be used in favour of automatically detected limits.
	this.demandXmax = null;
	this.demandYmin = null;
	this.demandYmax = null;
	this.demandZmin = null;
	this.demandZmax = null;
	this.minZ = 0; //minimum Z value currently being plotted
	this.maxZ = 1000000; //max Z value currently being plotted
	this.chooseLimitsCallback = function(){};

	//data
	this.plotBuffer = []; //buffer holding the current field, packed as this.plotBuffer[i][j], where i runs over rows and j over columns
	this.fakeData = {};
	this.fakeData.gaussian = []
	for(var i=0; i<100; i++){
		this.fakeData.gaussian[i] = [];
		for(var j=0; j<100; j++){
			this.fakeData.gaussian[i][j] = Math.exp(-(i-50)*(i-50)/(50)) * Math.exp(-(j-50)*(j-50)/(50));
		}
	}
	this.entries = 0; //number of entries in the displayed portion of the field in plotBuffer

    //cursors
    this.cursorX = 0; //x-bin of cursor
    this.cursorY = 0; //y-bin of cursor
    this.cursorZ = 0; //z value of bin indexed by this.plotBuffer[this.cursorX][this.cursorY]
    this.mouseMoveCallback = function(){}; //callback on moving the cursor over the plot, arguments are (x-bin, y-bin)
    this.highlightColor = '#8e44ad'; //color of drag highlight

    //click interactions
    this.XMouseLimitxMin = 0; //limits selected with the cursor
    this.XMouseLimitxMax = 0;
    this.YMouseLimityMin = 0;
    this.YMouseLimityMax = 0;
    this.clickBounds = [];

	//plot repaint loop
	this.RefreshTime = 3; //seconds to wait before a plot refresh when requested
	this.refreshHandler = null; //pointer to the plot's setTimeout when a repaint is requested

	////////////////////////////////////////////////////////////////
	//member functions//////////////////////////////////////////////
	////////////////////////////////////////////////////////////////
	//draw the plot frame
	this.drawFrame = function(){
		var binsPerTick, countsPerTick, i, label,
			axis, tick, text, tickOptions;

		//determine bin render width
		this.binWidthX = this.xAxisPixLength / (this.XaxisLimitMax - this.XaxisLimitMin);
		this.binWidthY = this.yAxisPixLength / (this.YaxisLimitMax - this.YaxisLimitMin);

		//clear canvas
		this.containerMain.removeAllChildren();
		this.containerOverlay.removeAllChildren();

		//draw principle axes:
		axis = new createjs.Shape();
		axis.graphics.ss(this.axisLineWidth).s(this.axisColor);
		axis.graphics.mt(this.leftMargin, this.topMargin);
		axis.graphics.lt(this.leftMargin, this.canvas.height-this.bottomMargin);
		axis.graphics.lt(this.canvas.width - this.rightMargin, this.canvas.height - this.bottomMargin);
		axis.graphics.lt(this.canvas.width - this.rightMargin, this.topMargin);
		axis.graphics.lt(this.leftMargin, this.topMargin);
		this.containerMain.addChild(axis);


		//Decorate x axis////////////////////////////////////////////////////////
		//decide how many ticks to draw on the x axis; come as close to a factor of the number of bins as possible:
		this.nXticks = 10;
		tickOptions = [10, 5, 4];
		for(i=0; i<tickOptions.length; i++){
			if(this.XaxisLength % tickOptions[i] < this.XaxisLength % this.nXticks)
				this.nXticks = tickOptions[i];
		}

		//draw at most one tick per bin:
		if(this.XaxisLength < (this.nXticks-1) )
			this.nXticks = this.XaxisLength+1;

		//how many bins should there be between each tick?
		binsPerTick = Math.floor((this.XaxisLimitMax - this.XaxisLimitMin) / this.nXticks);

		//draw x axis ticks & labels:
		for(i=0; i<( (this.XaxisLength % this.nXticks == 0) ? this.nXticks+1 : this.nXticks); i++){
			//ticks
			tick = new createjs.Shape();
			tick.graphics.ss(this.axisLineWidth).s(this.axisColor);
			tick.graphics.mt(this.leftMargin + i*binsPerTick*this.binWidthX, this.canvas.height - this.bottomMargin);
			tick.graphics.lt(this.leftMargin + i*binsPerTick*this.binWidthX, this.canvas.height - this.bottomMargin + this.tickLength);
			this.containerMain.addChild(tick);

			//labels
			label = (this.XaxisLimitMin + i*binsPerTick).toFixed(0);
			text = new createjs.Text(label, this.context.font, this.axisColor);
			text.textBaseline = 'top';
			text.x = this.leftMargin + i*binsPerTick*this.binWidthX - this.context.measureText(label).width/2;
			text.y = this.canvas.height - this.bottomMargin + this.tickLength + this.xLabelOffset;
			this.containerMain.addChild(text);

		}

		//Decorate y axis////////////////////////////////////////////////////////
		//decide how many ticks to draw on the x axis; come as close to a factor of the number of bins as possible:
		this.nYticks = 10;
		tickOptions = [10, 5, 4];
		for(i=0; i<tickOptions.length; i++){
			if(this.YaxisLength % tickOptions[i] < this.YaxisLength % this.nYticks)
				this.nYticks = tickOptions[i];
		}

		//draw at most one tick per bin:
		if(this.YaxisLength < (this.nYticks-1) )
			this.nYticks = this.YaxisLength+1;

		//how many bins should there be between each tick?
		binsPerTick = Math.floor((this.YaxisLimitMax - this.YaxisLimitMin) / this.nYticks);

		//draw y axis ticks & labels:
		for(i=0; i<( (this.YaxisLength % this.nYticks == 0) ? this.nYticks+1 : this.nYticks); i++){
			//ticks
			tick = new createjs.Shape();
			tick.graphics.ss(this.axisLineWidth).s(this.axisColor);
			tick.graphics.mt( this.leftMargin, this.canvas.height - this.bottomMargin - i*binsPerTick*this.binWidthY);
			tick.graphics.lt( this.leftMargin - this.tickLength, this.canvas.height - this.bottomMargin - i*binsPerTick*this.binWidthY);
			this.containerMain.addChild(tick);

			//labels
			label = (this.YaxisLimitMin + i*binsPerTick).toFixed(0);
			text = new createjs.Text(label, this.context.font, this.axisColor);
			text.textBaseline = 'middle';
			text.x = this.leftMargin - this.tickLength - this.context.measureText(label).width - this.yLabelOffset;
			text.y = this.canvas.height - this.bottomMargin - i*binsPerTick*this.binWidthY;
			this.containerMain.addChild(text);

		}

		//x axis title:
		text = new createjs.Text(this.xAxisTitle, this.context.font, this.axisColor);
		text.textBaseline = 'bottom';
		text.x = this.canvas.width - this.rightMargin - this.context.measureText(this.xAxisTitle).width;
		text.y = this.canvas.height - this.fontScale/2;
		this.containerMain.addChild(text);

		//y axis title:
		text = new createjs.Text(this.yAxisTitle, this.context.font, this.axisColor);
		text.textBaseline = 'alphabetic';
		text.rotation = -90;
		text.x = this.leftMargin*0.25;
		text.y = this.context.measureText(this.yAxisTitle).width + this.topMargin;
		this.containerMain.addChild(text);		

	};

	//update the plot
	this.plotData = function(RefreshNow){
		var i, j, x0, y0, cell, color, scale;

		this.chooseLimits();
		this.drawFrame();

		for(i=0; i<this.plotBuffer.length; i++){
			y0 = this.canvas.height - this.bottomMargin - (i+1)*this.binWidthY; //y coord of top left corner of bin
			for(j=0; j<this.plotBuffer[i].length; j++){
				if(i >= this.YaxisLimitMin && i < this.YaxisLimitMax && j >= this.XaxisLimitMin && j<this.XaxisLimitMax){
					x0 = this.leftMargin + j*this.binWidthX; //x coord of top left corner of bin
					scale = (this.plotBuffer[i][j] - this.minZ) / this.maxZ //map z value of this bin onto [0,1]
					scale = Math.max(scale, 0);
					scale = Math.min(scale, 1);
					color = this.colorPicker(scale);  //choose the color corresponding to this z value
					cell = new createjs.Shape();  //add the cell to the plot
					cell.graphics.f(color).r(x0, y0, this.binWidthX, this.binWidthY);
					this.containerMain.addChild(cell);
				}
			}
		}
		this.containerMain.cache(0, 0, this.canvas.width, this.canvas.height);

		this.stage.update();

		//callback
		this.drawCallback();

		// Pause for some time and then recall this function to refresh the data display
		//if(this.RefreshTime>0 && RefreshNow==1) this.refreshHandler = setTimeout(function(){plotData(1, 'true')},this.RefreshTime*1000); 	
	};

	//map [0,1] onto various color scales, return hex color string '#123456'
	this.colorPicker = function(scale, palette){
	    //map scale onto [0,360]:
	    var H = scale*300 / 60;
	    if(H>5) H=5;
	    if(H<0) H=0;
	    var R, G, B;
	    var start0, start1, start2, start3, start4, start5;
	    //if (palette == 'ROOT Rainbow'){
	        start0 = [0xFF,0x00,0x00];
	        start1 = [0xFF,0xFF,0x00];
	        start2 = [0x00,0xFF,0x00];
	        start3 = [0x00,0xFF,0xFF];
	        start4 = [0x00,0x00,0xFF];
	        start5 = [0x66,0x00,0xCC];
	        H = -1*(H-5);
	    //} 

	    if(H>=0 && H<1){
	        R = start0[0] + Math.round(H*(start1[0]-start0[0]));
	        G = start0[1] + Math.round(H*(start1[1]-start0[1]));
	        B = start0[2] + Math.round(H*(start1[2]-start0[2]));
	    } else if(H>=1 && H<2){
	        R = start1[0] + Math.round((H-1)*(start2[0]-start1[0]));
	        G = start1[1] + Math.round((H-1)*(start2[1]-start1[1]));
	        B = start1[2] + Math.round((H-1)*(start2[2]-start1[2]));
	    } else if(H>=2 && H<3){
	        R = start2[0] + Math.round((H-2)*(start3[0]-start2[0]));
	        G = start2[1] + Math.round((H-2)*(start3[1]-start2[1]));
	        B = start2[2] + Math.round((H-2)*(start3[2]-start2[2]));
	    } else if(H>=3 && H<4){
	        R = start3[0] + Math.round((H-3)*(start4[0]-start3[0]));
	        G = start3[1] + Math.round((H-3)*(start4[1]-start3[1]));
	        B = start3[2] + Math.round((H-3)*(start4[2]-start3[2]));
	    } else if(H>=4 && H<=5){
	        R = start4[0] + Math.round((H-4)*(start5[0]-start4[0]));
	        G = start4[1] + Math.round((H-4)*(start5[1]-start4[1]));
	        B = start4[2] + Math.round((H-4)*(start5[2]-start4[2]));  
	    }

	    R = Math.round(R).toString(16);
	    G = Math.round(G).toString(16);
	    B = Math.round(B).toString(16);

	    if(R.length == 1) R = '0'+R;
	    if(G.length == 1) G = '0'+G;
	    if(B.length == 1) B = '0'+B;

	    return '#'+R+G+B;
	}

	//choose appropriate axis limits: default will fill the plot area, but can be overridden with this.demandXmin etc.
	this.chooseLimits = function(){

		var i, j, 
			minZ = 0xFFFFFFFF, 
			maxZ = 0,
			counts = 0,
			maxZvalue = 0;

		this.XaxisLimitAbsMax = 0;
		this.YaxisLimitAbsMax = this.plotBuffer.length;

		for(i=0; i<this.plotBuffer.length; i++){
			this.XaxisLimitAbsMax = Math.max(this.XaxisLimitAbsMax, this.plotBuffer[i].length);
			for(j=0; j<this.plotBuffer[i].length; j++){
				//find minimum and maximum Z value to be displayed, and the sum of everything in the current display range:
				if(i >= this.YaxisLimitMin && i < this.YaxisLimitMax && j >= this.XaxisLimitMin && j<this.XaxisLimitMax){
					minZ = Math.min(minZ, this.plotBuffer[i][j]);
					maxZ = Math.max(maxZ, this.plotBuffer[i][j]);
					counts += this.plotBuffer[i][j];
				}

			}
		}
		this.entries = counts;
		this.minZ = minZ;
		this.maxZ = maxZ;

		//use demand overrides if present:
		//X
		if(typeof this.demandXmin === 'number') this.XaxisLimitMin = this.demandXmin;
		if(typeof this.demandXmax === 'number'){
			this.XaxisLimitMax = this.demandXmax;
			if(this.demandXmax > this.XaxisLimitAbsMax)
				this.XaxisLimitAbsMax = this.demandXmax;
		}
		//Y
		if(typeof this.demandYmin === 'number') this.YaxisLimitMin = this.demandYmin;
		if(typeof this.demandYmax === 'number'){
			this.YaxisLimitMax = this.demandYmax;
			if(this.demandYmax > this.YaxisLimitAbsMax)
				this.YaxisLimitAbsMax = this.demandYmax;
		}
		//Z
		if(typeof this.demandZmin === 'number') this.ZaxisLimitMin = this.demandZmin;
		else this.ZaxisLimitMin = 0;
		if(typeof this.demandZmax === 'number') maxZvalue = this.demandZmax;
		else maxZvalue = this.ZaxisLimitMax

		// Adjust the Z axis limit
		if(maxZvalue>5){
			if(this.zAxisType==0) this.ZaxisLimitMax=Math.floor(maxZvalue*1);
			if(this.zAxisType==1) this.ZaxisLimitMax=maxZvalue*10;
		} else {
			if(this.zAxisType==0) this.ZaxisLimitMax=5;
			if(this.zAxisType==1) this.ZaxisLimitMax=50;
		}

		if(this.zAxisType==0)
			this.ZaxisLength = this.ZaxisLimitMax-this.ZaxisLimitMin;
		if(this.zAxisType==1)
			this.ZaxisLength = Math.log10(this.ZaxisLimitMax) - Math.log10(this.ZaxisLimitMin);

		//callback when limits are chosen - user fudges
		this.chooseLimitsCallback();

	};









	//handle drag-to-zoom on the plot
	this.DragWindow = function(){
		var buffer;

		//don't even try if there's only one bin selected:
		if(this.XMouseLimitxMin != this.XMouseLimitxMax){
			//don't confuse the click limits with the click and drag limits:
			this.clickBounds[0] = 'abort';

			//Make sure the max is actually the max:
			if(this.XMouseLimitxMax < this.XMouseLimitxMin){
				buffer = this.XMouseLimitxMax;
				this.XMouseLimitxMax = this.XMouseLimitxMin;
				this.XMouseLimitxMin = buffer;
			}

			//keep things in range
			if(this.XMouseLimitxMin < 0) this.XMouseLimitxMin = 0;
			if(this.XMouseLimitxMax > this.XaxisLimitAbsMax) this.XMouseLimitxMax = this.XaxisLimitAbsMax;

			//stick into the appropriate globals
			this.XaxisLimitMin = parseInt(this.XMouseLimitxMin);
			this.XaxisLimitMax = parseInt(this.XMouseLimitxMax);
	
			//drawXaxis();
			this.YaxisLimitMax=5;

			this.plotData();

		}
	};

	//handle clicks on the plot
	this.ClickWindow = function(bin){

		//decide what to do with the clicked limits - zoom or fit?
		if(this.clickBounds.length == 0){
			this.clickBounds[0] = bin;
		} else if(this.clickBounds[0] == 'abort' && !this.fitModeEngage){
			this.clickBounds = [];
		} else if(this.clickBounds.length == 2 ){
			this.clickBounds = [];
			this.clickBounds[0] = bin;
		} else if(this.clickBounds.length == 1){
			this.clickBounds[1] = bin;
			//fit mode
			if(this.fitModeEngage){
				this.FitLimitLower = Math.min(this.clickBounds[0], this.clickBounds[1]);
				this.FitLimitUpper = Math.max(this.clickBounds[0], this.clickBounds[1]);
				this.fitData(this.fitTarget);
			} else {  //zoom mode
				//use the mouse drag function to achieve the same effect for clicking:
				this.XMouseLimitxMin = this.clickBounds[0];
				this.XMouseLimitxMax = this.clickBounds[1];
				this.DragWindow();
				this.clickBounds = [];
			}
		}
	};

	//scroll the plot x-window by x to the right
	this.scrollSpectra = function(step){
		var windowSize = this.XaxisLimitMax - this.XaxisLimitMin;

		this.XaxisLimitMin += step;
		this.XaxisLimitMax += step;

		if(this.XaxisLimitMin < 0){
			this.XaxisLimitMin = 0;
			this.XaxisLimitMax = windowSize;
		}

		if(this.XaxisLimitMax > this.XaxisLimitAbsMax){
			this.XaxisLimitMax = this.XaxisLimitAbsMax;
			this.XaxisLimitMin = this.XaxisLimitMax - windowSize;
		}

		this.plotData();

		//TBD: callbacks?
	};

	//recalculate x axis limits, for use when plots are deleted or hidden
	this.adjustXaxis = function(){
		this.XaxisLimitMin = (typeof this.demandXmin === 'number') ? this.demandXmin : 0;
		//use override max is present
		if(typeof this.demandXmax === 'number'){
			this.XaxisLimitAbsMax = this.demandXmax;
			this.XaxisLimitMax = this.demandXmax;
			return;
		}
		//autodetect max otherwise
		this.XaxisLimitAbsMax = 0;
		for(thisSpec in this.plotBuffer){
			//skip hidden spectra
			if(this.hideSpectrum[thisSpec]) continue;

			//Find the maximum X value from the size of the data
			this.XaxisLimitAbsMax = Math.max(this.XaxisLimitAbsMax, this.plotBuffer[thisSpec].length);
		}
		this.XaxisLimitMax = this.XaxisLimitAbsMax;		
	}

	//zoom out to the full x-range
	this.unzoom = function(){
		var thisSpec;

		this.adjustXaxis();
		this.clearFits();

		this.plotData();
	};

	//set the axis to 'linear' or 'log', and repaint
	this.setAxisType = function(type){
		if(type=='log'){
			this.YaxisLimitMin = 0.1;
			this.AxisType = 1;
		}
		else{
			this.YaxisLimitMin = 0;
			this.AxisType = 0;
		}
		this.plotData();
	};

	//suppress or unsuppress a spectrum from being shown
	this.toggleSpectrum = function(spectrumName, hide){
		this.hideSpectrum[spectrumName] = hide;

		this.adjustXaxis();

		this.plotData();
	};

	//remove a data series from the buffer
	this.removeData = function(name){
		//free the color
		this.colorAssignment[this.colorAssignment.indexOf(name)] = null;

		//delete the data
		delete this.plotBuffer[name];
	};

	//////////////////////////////////////////////////////
	//initial setup///////////////////////////////////////
	//////////////////////////////////////////////////////
	this.drawFrame();
	//plot mouseover behavior - report mouse coordinates in bin-space, and manage the cursor style
	this.canvas.addEventListener('mousemove', function(event){
		var coords, x, y, xBin, yBin;
		var crosshairs, highlight;

		coords = this.canvas.relMouseCoords(event);
		x = coords.x;
		y = coords.y;

        if(x > this.leftMargin && x < this.canvas.width - this.rightMargin && y > this.topMargin){
	        xBin = Math.floor((x-this.leftMargin)/this.binWidth) + this.XaxisLimitMin;
    	    
    	    if(this.AxisType == 1){
    	    	yBin = (this.canvas.height-this.bottomMargin - y) / this.countHeight;
    	    	yBin = Math.floor(Math.pow(10,yBin)/10);
    	    } else {
    	    	yBin = Math.floor((this.canvas.height-this.bottomMargin - y) / this.countHeight);
    	    }

    	    this.cursorX = xBin.toFixed(0);
    	    this.cursorY = yBin.toFixed(0);
        }
        this.mouseMoveCallback(xBin, yBin);

        //change cursor to indicate draggable region:
        if(this.fitModeEngage){
        	if( y < (this.canvas.height - this.bottomMargin) )
	        	document.body.style.cursor = 's-resize';
	        else 
	        	document.body.style.cursor = 'n-resize';
	    }
        else if(y>this.canvas.height-this.bottomMargin) 
        	document.body.style.cursor = 'pointer';
        else
        	document.body.style.cursor = 'default';

        //draw crosshairs
        this.containerOverlay.removeAllChildren();
        if(x > this.leftMargin && x < this.canvas.width - this.rightMargin && y > this.topMargin && y<this.canvas.height-this.bottomMargin){
			crosshairs = new createjs.Shape();
			crosshairs.graphics.ss(this.axisLineWidth).s(this.axisColor);
			crosshairs.graphics.mt(this.leftMargin, y);
			crosshairs.graphics.lt(this.canvas.width-this.rightMargin, y);
			this.containerOverlay.addChild(crosshairs);

			crosshairs = new createjs.Shape();
			crosshairs.graphics.ss(this.axisLineWidth).s(this.axisColor);
			crosshairs.graphics.mt(x, this.canvas.height-this.bottomMargin);
			crosshairs.graphics.lt(x, this.topMargin);
			this.containerOverlay.addChild(crosshairs);
		}
		//highlight region on drag
		if(this.highlightStart != -1){
			highlight = new createjs.Shape();
			highlight.alpha = 0.3;
			highlight.graphics.beginFill(this.highlightColor).r(this.highlightStart, this.topMargin, Math.max(x, this.leftMargin) - this.highlightStart, this.canvas.height-this.topMargin-this.bottomMargin)
			this.containerOverlay.addChild(highlight);
		}
		this.stage.update();

	}.bind(this), false);

	this.canvas.onmouseout = function(event){
		document.body.style.cursor = 'default';
		this.containerOverlay.removeAllChildren();
		this.stage.update();
	}.bind(this);

	this.canvas.onmousedown = function(event){
		if(event.button == 0){
			this.highlightStart = this.canvas.relMouseCoords(event).x;
			this.XMouseLimitxMin = parseInt((this.canvas.relMouseCoords(event).x-this.leftMargin)/this.binWidth + this.XaxisLimitMin);
		}
	}.bind(this);

	this.canvas.onmouseup = function(event){
			if(event.button == 0){
				this.highlightStart = -1;
				this.XMouseLimitxMax = parseInt((this.canvas.relMouseCoords(event).x-this.leftMargin)/this.binWidth + this.XaxisLimitMin); 
				this.DragWindow();
				this.ClickWindow( parseInt((this.canvas.relMouseCoords(event).x-this.leftMargin)/this.binWidth + this.XaxisLimitMin) );
			}
	}.bind(this);

	this.canvas.ondblclick = function(event){
		this.unzoom();
	}.bind(this);

	//right clicking does obnoxious focus things, messes with canvas onclicks.
	this.canvas.oncontextmenu = function(){
		return false;
	};

}

//stick a coordinate tracker on the canvas prototype:
function relMouseCoords(event){
    var totalOffsetX = 0,
    totalOffsetY = 0,
    canvasX = 0,
    canvasY = 0,
    currentElement = this,
    test = [],
    elts = [];

	if (event.offsetX !== undefined && event.offsetY !== undefined) { return {x:event.offsetX, y:event.offsetY}; }
	//if (event.layerX !== undefined && event.layerY !== undefined) { return {x:event.layerX, y:event.layerY}; }

    do{
        totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
        totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
        //test[test.length] = currentElement.offsetLeft - currentElement.scrollLeft
        //elts[elts.length] = currentElement
    }
    while(currentElement = currentElement.offsetParent)

    canvasX = event.pageX - totalOffsetX;
    canvasY = event.pageY - totalOffsetY;

    //hack to deal with FF scroll, better solution TBD:
    if(event.offsetX == undefined){
    	canvasX -= document.body.scrollLeft;
    	canvasY -= document.body.scrollTop;
    }

    return {x:canvasX, y:canvasY}
}
HTMLCanvasElement.prototype.relMouseCoords = relMouseCoords;

//tell the Math library about log base 10:
Math.log10 = function(n) {
	return (Math.log(n)) / (Math.log(10));
};