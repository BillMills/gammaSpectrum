gammaSpectrum
=============

Welcome!  gammaSpectrum.js is a simple, lightweight JavaScript tool for making interactive histograms in the browser, originally developed for the GRIFFIN Collaboration at TRIUMF.  gammaSpectrum is still under heavy development, so check back for new features and feel free to make requests!

Tested in Chrome & FF, and distributed under the MIT license.

#Usage

##Set-Up
Setting up gammaSpectrum is simple!  All you need to include in your page is the core gammaSpectrum.js, and the fabulous [easel.js](http://www.createjs.com/#!/EaselJS) via 

    <script src="http://code.createjs.com/easeljs-0.7.0.min.js"></script>
    
All objects are kept nicely namespaced in the spectrumViewer object, and one function each are appended to the prototypes of canvas and Math, respectively.

##Instantiation
Once it's loaded, spectrums can be plotted on any \<canvas\> element.  Just declare a new spectrumViewer object, pointing to your canvas' ID:

    var viewer = new spectrumViewer('spectrumCanvas');
    
Go ahead and declare as many of these canvas / viewer pairs as you need - everything is encapsulated so there shouldn't be any collision problems.

##Loading Data
Data to be plotted is loaded using the .addData method:

    viewer.addData('myPlot', [0,0,1,4,9,16,9,4,1,0,0]);
    
would add the array in the second argument to the list of histograms to be plotted, and assign the key 'myPlot' to reference it by.  Data series can be removed with

    viewer.removeData('myPlot');

gammaSpectrum comes with a fake spectrum you can play around with, which is loaded in the demo page.

##Options
Have a look in the gammaSpectrum.js file near the top, under the heading 'member variables' - this section has a list of all the parameters that govern plot generation, and comments describing them.  You don't need to do anything to run the demo, but here's where all the options are if you're looking for them.

##Plot Interactions
gammaSpectrum offers several pre-packaged methods for interacting with your spectra.

###Mouseover
When you mouse over a spectrumViewer object, it keeps track of what x and y bin you're pointing at.  There's an example in the demo of how to also pass in a callback to the mouseover event, so you can do things with those numbers as the mouse moves.

###Zoom & Scroll
There are a bunch of default interactions defined for walking around your spectrum.  Try all of these in the included demo.html.

####Click Window
Open up the demo.html example in a browser, and click on either side of one of the peaks - voila!  The display zooms in to be bounded by the two x-bins you clicked on, no extra setup required.

####Unzoom
Unzoom is set up by default as the canvas' double-click feature.  Also, the demo provides an example of attaching the unzoom() method to a button. 

####Drag Window
Mouse down on the plot, drag across, and release - the window zooms in on the range you dragged over.

####Scroll Window
Functionality is provided to easily make scroll buttons for your spectrum.  The 'left' and 'right' buttons in demo.html are an example of how to set these up; try changing the +-100 parameter to change how far the plot scrolls on every click.

###Fitting
gammaSpectrum was built for looking at gamma ray spectra (surprise!), so currently the only fit function available is a gaussian.  

The fitting suite in gammaSpectrum, fitit.js, is a first-pass at a maximum likelihood fitter.  An instance of this tool requires the following minimal member variables to be defined in order to converge a fit:

    fitter.x: array containing the left edge of each channel in x
    fitter.y: array containing the y values corresponding the the channels in fitter.x
    fitter.fxn: JS function of the form function(x, par), where x is the indept. variable and par is an array of arguments. 
    fitter.guess: guess for the initial value of par in fitter.fxn
    
At present, the fitter assumes channels are all 1 unit wide, and associates the corresponding y value with the center of that bin; better generality forthcoming.  Likelihood is computed from the poissonian probability of seeing the observed number of counts in each bin if the true average is given by fitter.fxn; this likelihood is extremized by walking down the gradient of the likelihood function from the point in parameter space fitter.guess, towards the corresponding local minimum.  Derivatives for this gradient are approximated using a two-step Richardson extrapolation.
    
If that all sounds a bit ambitious, gammaSpectrum has a flag .MLfit, which when set to false will replace the maximum likelihood fit with a simple gaussian approximation using the mode of the region selected, and the width of the peak around that max.    
    
In either case, to fit a peak, tell the spectrumViewer object which spectrum you want to fit by setting the member variable fitTarget to the key tagging the data in plotBuffer, and then enter fit mode for the spectrumViewer object by calling the member function setupFitMode.  Then, just click on the plot to the left and right of the peak you want to fit, and voila!  A gaussian guess is drawn.  Pass in a callback to fetch the fit parameters out and do something with them, like the example in demo.html.
